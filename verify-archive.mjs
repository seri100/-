import fs from 'node:fs'
import assert from 'node:assert/strict'
import { isArchived, archivedRows, archiveCsv } from './public/static/bid-archive.js'
const now = Date.parse('2026-11-04T12:00:00+09:00')
assert.equal(isArchived({bid_deadline:'2026-11-03 12:00:01'},now),false)
assert.equal(isArchived({bid_deadline:'2026-11-03 12:00:00'},now),true)
assert.equal(isArchived({bid_deadline:null},now),false)
assert.equal(isArchived({bid_deadline:'2026-11-03'},now),false)
assert.ok(archiveCsv([{title:'=1+1'}]).includes("'=1+1"))
let rows=[], offset=0
while(true) {
 const r=await fetch('https://webapp-78e.pages.dev/api/gcal-bids?limit=500&offset='+offset).then(r=>r.json())
 assert.ok(r.success)
 rows.push(...r.data); offset+=r.data.length
 if(offset>=r.total) break
 assert.ok(r.data.length)
}
const expired=archivedRows(rows)
const archiveDir = 'X:/VOL1/bid/AI/입찰관리 대시보드'
fs.mkdirSync(archiveDir,{recursive:true})
const prefix=archiveDir+'/bids_archive_'+new Date().toISOString().replaceAll(':','-')
fs.writeFileSync(prefix+'.json',JSON.stringify(expired,null,2))
fs.writeFileSync(prefix+'.csv',archiveCsv(expired))
assert.equal(JSON.parse(fs.readFileSync(prefix+'.json')).length,expired.length)
console.log('Archive verified:',expired.length,'of',rows.length)
console.log(prefix+'.json'); console.log(prefix+'.csv')
