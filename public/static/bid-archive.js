import { deadlineTime } from './bid-workflow.js'
export function isArchived(bid, now = Date.now()) {
  const deadline = deadlineTime(bid.bid_deadline)
  return deadline !== null && now >= deadline + 86400000
}
export function archivedRows(rows, now = Date.now()) {
  return rows.filter(row => isArchived(row, now))
}
export function archiveCsv(rows) {
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))]
  const cell = value => {
    let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text
    return '"' + text.replaceAll('"', '""') + '"'
  }
  return '\uFEFF' + [keys.map(cell).join(','), ...rows.map(row => keys.map(key => cell(row[key])).join(','))].join('\r\n')
}
export function renderArchiveControls(rows) {
  let host = document.getElementById('gcal-archive-controls')
  if (!host) {
    host = document.createElement('div')
    host.id = 'gcal-archive-controls'
    host.className = 'text-sm text-gray-600 mb-3 flex gap-3 items-center'
    document.getElementById('gcal-filter-bar').after(host)
  }
  const archived = archivedRows(rows)
  host.replaceChildren()
  const label = document.createElement('span')
  label.textContent = '마감 +24시간 경과: ' + archived.length + '건 보관'
  host.append(label)
  for (const type of ['csv', 'json']) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'border rounded px-3 py-1 bg-white text-purple-700'
    button.textContent = '종료 공고 ' + type.toUpperCase() + ' 저장'
    button.disabled = !archived.length
    button.onclick = () => {
      const content = type === 'csv' ? archiveCsv(archived) : JSON.stringify(archived, null, 2)
      const url = URL.createObjectURL(new Blob([content], {type: type === 'csv' ? 'text/csv;charset=utf-8' : 'application/json'}))
      const link = document.createElement('a')
      link.href = url
      link.download = 'bids_archive_' + new Date().toLocaleDateString('sv-SE', {timeZone:'Asia/Seoul'}) + '.' + type
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    host.append(button)
  }
}
