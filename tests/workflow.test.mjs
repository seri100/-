import test from 'node:test'
import assert from 'node:assert/strict'
import {signals, readWorkflow, validateWorkflow, deadlineTime, workState} from '../public/static/bid-workflow.js'

const now = Date.parse('2026-11-03T09:00:00+09:00')
const bid = {summary: 'ㅇ?ㅁ◆&#80.495% /소방공사', bid_deadline: '2026-11-04 10:00:00', agreement_deadline: '2026-11-03 18:00:00'}
test('all symbols and terminal percent are understood without treating a date as a rate', () => {
  assert.deepEqual(signals('ㅇ?ㅁ◆&@#80.495%'), {seri:true,jinyu:true,joint:true,electric:true,telecom:true,yh:true,quote:true,cancelled:false,rate:80.495})
  assert.equal(signals('2026-11-03').rate, null)
})
test('legacy completion does not silently complete both companies', () => {
  const state = workState({...bid,status:'제출완료'},now)
  assert.equal(state.submission,true)
  assert.equal(state.needsConfirmation,true)
})
test('one company completion leaves the second company outstanding', () => {
  const workflow = readWorkflow(null,bid.summary)
  workflow.seri.submitted = true
  assert.equal(workState({...bid,workflow_json:JSON.stringify(workflow)},now).submission,true)
  workflow.jinyu.submitted = true
  assert.equal(workState({...bid,workflow_json:JSON.stringify(workflow)},now).submission,false)
})
test('joint marker is never equivalent to agreement completion', () => {
  assert.equal(workState(bid,now).agreementPending,true)
  assert.equal(workState(bid,Date.parse('2026-11-03T18:00:00+09:00')).agreementPending,false)
})
test('quote completion is per recipient and unresolved hash remains pending', () => {
  assert.equal(workState(bid,now).quotePending,true)
  const workflow = readWorkflow(null,bid.summary)
  workflow.quotes = [{company:'업체A',done:true},{company:'업체B',done:false}]
  assert.equal(workState({...bid,workflow_json:workflow},now).quotePending,true)
  workflow.quotes[1].done = true
  assert.equal(workState({...bid,workflow_json:workflow},now).quotePending,false)
})
test('expired and cancelled notices cannot generate pending work', () => {
  for (const b of [{...bid,summary:'[취소공고] '+bid.summary},{...bid,bid_deadline:'2026-11-02 10:00:00',agreement_deadline:'2026-11-01 18:00:00'}]) {
    const w=workState(b,now)
    assert.equal(w.active || w.submission || w.agreementPending || w.quotePending,false)
  }
})
test('KST dates do not depend on runtime timezone and date-only is unconfirmed', () => {
  assert.equal(deadlineTime('2026/11/03 09:00:00'),now)
  assert.equal(deadlineTime('2026-11-03T00:00:00Z'),now)
  assert.equal(deadlineTime('2026-11-03'),null)
  assert.equal(deadlineTime('garbage'),null)
})
test('stored opt-out is preserved and malformed workflow is rejected', () => {
  const workflow=readWorkflow(null,bid.summary)
  workflow.seri.participating=false
  assert.equal(readWorkflow(JSON.stringify(workflow),bid.summary).seri.participating,false)
  assert.equal(validateWorkflow(workflow),true)
  workflow.quotes=[{company:'',done:true}]
  assert.equal(validateWorkflow(workflow),false)
  assert.equal(validateWorkflow({seri:{submitted:'true'}}),false)
})
