import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import app from '../dist/_worker.js'
import { readWorkflow } from '../public/static/bid-workflow.js'

function setup() {
  const db = new DatabaseSync(':memory:')
  for (const name of ['0004_gcal_bids.sql','0005_gcal_calendar_tags.sql','0006_gcal_bid_workflow.sql']) {
    db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'))
  }
  db.prepare('INSERT INTO gcal_bids(event_id, title, summary, bid_deadline) VALUES(?,?,?,?)')
    .run('test', '시험 공고', 'ㅇ?ㅁ#80.495% /시험 공고', '2026-11-05 10:00:00')
  db.prepare("INSERT INTO gcal_bid_status(event_id,status,memo) VALUES('test','제출완료','보존할 메모')").run()
  const DB = {prepare(sql) {
    let values = []
    return {
      bind(...args) {values=args;return this},
      async first() {return db.prepare(sql).get(...values) ?? null},
      async all() {return {results:db.prepare(sql).all(...values)}},
      async run() {return {meta:db.prepare(sql).run(...values)}}
    }
  }}
  return {db, request(path, method='GET', body) {
    return app.fetch(new Request('https://example.test'+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),{DB})
  }}
}
test('API persists separate company work, preserves legacy notes and rejects stale writers', async () => {
  const {db,request}=setup()
  const workflow=readWorkflow(null,'ㅇ?ㅁ#')
  workflow.seri.submitted=true
  let response=await request('/api/gcal-bids/test/workflow','PUT',{workflow,expected:null})
  assert.equal(response.status,200)
  response=await request('/api/gcal-bids/test')
  const bid=(await response.json()).data
  assert.equal(bid.memo,'보존할 메모')
  assert.equal(bid.status,'제출완료')
  assert.equal(JSON.parse(bid.workflow_json).jinyu.submitted,false)
  response=await request('/api/gcal-bids/test/workflow','PUT',{workflow,expected:null})
  assert.equal(response.status,409)
  workflow.jinyu.submitted=true
  response=await request('/api/gcal-bids/test/workflow','PUT',{workflow,expected:bid.workflow_json})
  assert.equal(response.status,200)
  response=await request('/api/gcal-bids/test/workflow','PUT',{workflow,expected:bid.workflow_json})
  assert.equal(response.status,409)
  assert.equal(db.prepare('SELECT memo FROM gcal_bid_status').get().memo,'보존할 메모')
})
test('pagination exposes full total and uses stable order; missing/invalid updates are rejected',async()=>{
  const {db,request}=setup()
  db.prepare('INSERT INTO gcal_bids(event_id,title,bid_deadline) VALUES(?,?,?)').run('test2','두번째','2026-11-05 10:00:00')
  const first=await (await request('/api/gcal-bids?limit=1')).json()
  const second=await (await request('/api/gcal-bids?limit=1&offset=1')).json()
  assert.equal(first.total,2)
  assert.notEqual(first.data[0].event_id,second.data[0].event_id)
  assert.equal((await request('/api/gcal-bids/test/workflow','PUT',{workflow:{}})).status,400)
  assert.equal((await request('/api/gcal-bids/missing/workflow','PUT',{workflow:readWorkflow(null,'')})).status,404)
})
test('dashboard HTML loads module script and all workflow controls',async()=>{
  const {request}=setup()
  const response=await request('/gcal')
  assert.equal(response.status,200)
  const html=await response.text()
  for(const text of ['gcal-work-summary','gcal-work-editor','gcal-company','협정마감','type="module"']) assert.ok(html.includes(text),text)
})
