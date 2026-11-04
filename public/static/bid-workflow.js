export function signals(summary = '') {
  const text = String(summary)
  const rate = text.match(/(?:^|[^\d.])(\d{2}\.\d{3})\s*%?(?=\s*(?:[/,]|$))/)
  return {
    seri: text.includes('ㅇ'), jinyu: text.includes('?'), joint: text.includes('ㅁ'),
    electric: text.includes('◆'), telecom: text.includes('@'), yh: text.includes('&'),
    quote: text.includes('#'), cancelled: text.includes('취소공고'),
    rate: rate ? Number(rate[1]) : null
  }
}

export function readWorkflow(raw, summary) {
  let stored = {}
  try { stored = typeof raw === 'string' ? JSON.parse(raw) : (raw || {}) } catch {}
  const s = signals(summary)
  return {
    seri: { participating: s.seri, agreement_done: false, submitted: false, ...stored.seri },
    jinyu: { participating: s.jinyu, agreement_done: false, submitted: false, ...stored.jinyu },
    quotes: Array.isArray(stored.quotes) ? stored.quotes : [],
    quote_reviewed: stored.quote_reviewed === true
  }
}

export function validateWorkflow(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  for (const key of ['seri', 'jinyu']) {
    if (!value[key] || ['participating', 'agreement_done', 'submitted'].some(k => typeof value[key][k] !== 'boolean')) return false
  }
  return typeof value.quote_reviewed === 'boolean' && Array.isArray(value.quotes) && value.quotes.length <= 100 &&
    value.quotes.every(q => q && typeof q.company === 'string' && q.company.trim().length > 0 &&
      q.company.length <= 100 && typeof q.done === 'boolean')
}

// Source date strings are KST. Never let the browser's local timezone change a deadline.
export function deadlineTime(raw) {
  if (!raw) return null
  const s = String(raw).trim().replace(/\//g, '-')
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?$/.test(s)) return null
  const iso = s.replace(' ', 'T')
  const time = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : iso + '+09:00')
  return Number.isFinite(time) ? time : null
}

export function workState(bid, now = Date.now()) {
  const s = signals(bid.summary || bid.title)
  const w = readWorkflow(bid.workflow_json, bid.summary || bid.title)
  const companies = [w.seri, w.jinyu].filter(c => c.participating)
  const deadline = deadlineTime(bid.bid_deadline)
  const agreement = deadlineTime(bid.agreement_deadline)
  const active = !s.cancelled && (deadline === null || deadline > now)
  return {
    signals: s, workflow: w, deadline, agreement, active,
    submission: active && companies.some(c => !c.submitted),
    agreementPending: !s.cancelled && s.joint && companies.some(c => !c.agreement_done) &&
      (agreement !== null ? agreement > now : active),
    quotePending: active && (w.quotes.some(q => !q.done) || (s.quote && !w.quote_reviewed && w.quotes.length === 0)),
    // Old calendar colour/global status is evidence only, not company-level completion.
    needsConfirmation: bid.status === '제출완료' && companies.some(c => !c.submitted)
  }
}
