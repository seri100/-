import fs from 'node:fs'
import path from 'node:path'
import { archivedRows, archiveCsv } from './public/static/bid-archive.js'
const dir = 'X:/VOL1/bid/AI/\uC785\uCC30\uAD00\uB9AC \uB300\uC2DC\uBCF4\uB4DC'
if (!fs.existsSync('X:/')) throw new Error('X drive unavailable; archive was not written')
let rows=[], offset=0, expected
for (;;) {
  const response=await fetch('https://webapp-78e.pages.dev/api/gcal-bids?limit=500&offset='+offset, {signal:AbortSignal.timeout(60000)})
  if (!response.ok) throw new Error('HTTP '+response.status)
  const body=await response.json()
  if (!body.success || !Array.isArray(body.data) || !Number.isInteger(body.total)) throw new Error('Invalid API response')
  if (expected === undefined) expected=body.total
  if (body.total !== expected) throw new Error('Data changed during export; retry required')
  rows.push(...body.data); offset+=body.data.length
  if(offset>=expected) break
  if(!body.data.length) throw new Error('Incomplete export')
}
if(new Set(rows.map(row=>row.event_id)).size !== expected) throw new Error('Duplicate or missing records')
const archived=archivedRows(rows)
fs.mkdirSync(dir,{recursive:true})
const name='bids_archive_'+new Date().toISOString().replaceAll(':','-')
const prefix=path.join(dir,name)
try {
  fs.writeFileSync(prefix+'.json.tmp',JSON.stringify(archived,null,2),{flag:'wx'})
  fs.writeFileSync(prefix+'.csv.tmp',archiveCsv(archived),{flag:'wx'})
  if(JSON.parse(fs.readFileSync(prefix+'.json.tmp','utf8')).length !== archived.length) throw new Error('Archive verification failed')
  fs.renameSync(prefix+'.json.tmp',prefix+'.json')
  fs.renameSync(prefix+'.csv.tmp',prefix+'.csv')
} catch(error) {
  for(const suffix of ['.json.tmp','.csv.tmp']) {try {fs.unlinkSync(prefix+suffix)} catch {}}
  throw error
}
console.log(new Date().toISOString()+' SUCCESS total='+rows.length+' archived='+archived.length+' files='+name+'.json/.csv')
