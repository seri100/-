import { signals, readWorkflow, workState, deadlineTime } from './bid-workflow.js'
// 구글 캘린더 기준 입찰 관리 대시보드 프론트엔드 스크립트
const GCAL_BID_API_BASE = '/api/gcal-bids'
let allBids = []
let quickFilter = 'active'
let editingBid = null
let loadGeneration = 0

const listBodyEl = document.getElementById('gcal-bid-list-body')
const resultCountEl = document.getElementById('gcal-result-count')

const filterStatusEl = document.getElementById('gcal-filter-status')
const filterRegionEl = document.getElementById('gcal-filter-region')
const filterIndustryEl = document.getElementById('gcal-filter-industry')
const filterQEl = document.getElementById('gcal-filter-q')
const filterApplyBtn = document.getElementById('gcal-filter-apply-btn')
const filterResetBtn = document.getElementById('gcal-filter-reset-btn')
const syncBtn = document.getElementById('gcal-sync-btn')

const modalEl = document.getElementById('gcal-edit-modal')
const editEventIdEl = document.getElementById('gcal-edit-event-id')
const editBidTitleEl = document.getElementById('gcal-edit-bid-title')
const editStatusEl = document.getElementById('gcal-edit-status')
const editAssigneeEl = document.getElementById('gcal-edit-assignee')
const editMemoEl = document.getElementById('gcal-edit-memo')
const editSaveBtn = document.getElementById('gcal-edit-save-btn')
const editCancelBtn = document.getElementById('gcal-edit-cancel-btn')

// ===================== 입찰가 계산기 모달 요소 =====================
const calcModalEl = document.getElementById('gcal-calc-modal')
const calcTitleEl = document.getElementById('gcal-calc-title')
const calcBaseAmountEl = document.getElementById('gcal-calc-base-amount')
const calcBidMethodEl = document.getElementById('gcal-calc-bid-method')
const calcHahanRateEl = document.getElementById('gcal-calc-hahan-rate')
const calcTargetScoreEl = document.getElementById('gcal-calc-target-score')
const calcCustomScoreGroupEl = document.getElementById('gcal-calc-custom-score-group')
const calcCustomScoreEl = document.getElementById('gcal-calc-custom-score')
const calcDirectRateEl = document.getElementById('gcal-calc-direct-rate')
const calcRunBtn = document.getElementById('gcal-calc-run-btn')
const calcCloseBtn = document.getElementById('gcal-calc-close-btn')
const calcResultEl = document.getElementById('gcal-calc-result')
const calcRateTableBodyEl = document.getElementById('gcal-calc-rate-tbody')

// ================================================================

function escapeHtml(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatText(v) {
  if (!v) return '-'
  return v
}

function statusBadge(status) {
  if (status === '제출완료') {
    return '<span class="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">제출완료</span>'
  }
  return '<span class="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">검토중</span>'
}

function renderRow(bid) {
  const tr = document.createElement('tr')
  tr.className = 'hover:bg-gray-50'

  // 입찰가 계산 버튼: 나라장터 공고 (detail_url 이 g2b.go.kr 포함) 인 경우 표시
  const isNaraBid = bid.detail_url && bid.detail_url.includes('g2b.go.kr')
  const calcBtn = isNaraBid
    ? `<button class="gcal-calc-btn ml-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 whitespace-nowrap"
         data-event-id="${escapeHtml(bid.event_id)}"
         title="입찰가 계산기">🧮 계산</button>`
    : ''

  tr.innerHTML = `
    <td class="py-2 px-3">
      <button class="gcal-status-edit-btn" data-event-id="${escapeHtml(bid.event_id)}">
        ${statusBadge(bid.status)}
      </button>
    </td>
    <td class="py-2 px-3 max-w-xs">
      <span class="line-clamp-2" title="${escapeHtml(bid.title)}">${escapeHtml(bid.title)}</span>
      ${calcBtn}<div class="text-xs text-blue-700 mt-1">${tagText(bid)}</div>
    </td>
    <td class="py-2 px-3 whitespace-nowrap">${escapeHtml(bid.agency)}</td>
    <td class="py-2 px-3 whitespace-nowrap">${escapeHtml(bid.participant_region)}</td>
    <td class="py-2 px-3 whitespace-nowrap">${escapeHtml(bid.industry)}</td>
    <td class="py-2 px-3 whitespace-nowrap">${escapeHtml(bid.base_amount)}</td>
    <td class="py-2 px-3 whitespace-nowrap">${escapeHtml(formatText(bid.agreement_deadline))}</td>
    <td class="py-2 px-3 whitespace-nowrap">${escapeHtml(formatText(bid.bid_deadline))}<div class="text-xs text-purple-700">${remaining(bid.bid_deadline)}</div></td>
    <td class="py-2 px-3 whitespace-nowrap">${escapeHtml(bid.assignee)}</td>
    <td class="py-2 px-3 max-w-[160px]">
      ${pendingText(bid)}<span class="line-clamp-2 text-gray-500" title="${escapeHtml(bid.memo)}">${escapeHtml(bid.memo)}</span>
    </td>
    <td class="py-2 px-3">
      ${bid.detail_url ? `<a href="${escapeHtml(bid.detail_url)}" target="_blank" rel="noopener" class="text-blue-600 hover:underline"><i class="fas fa-external-link-alt"></i></a>` : '-'}
    </td>
  `

  const editBtn = tr.querySelector('.gcal-status-edit-btn')
  editBtn.addEventListener('click', () => openEditModal(bid))

  const cBtn = tr.querySelector('.gcal-calc-btn')
  if (cBtn) {
    cBtn.addEventListener('click', () => openCalcModal(bid))
  }

  return tr
}

function buildQuery() {
  const params = new URLSearchParams()
  if (filterStatusEl.value) params.set('status', filterStatusEl.value)
  if (filterRegionEl.value.trim()) params.set('region', filterRegionEl.value.trim())
  if (filterIndustryEl.value.trim()) params.set('industry', filterIndustryEl.value.trim())
  if (filterQEl.value.trim()) params.set('q', filterQEl.value.trim())
  return params.toString()
}

function remaining(raw) {
  const time = deadlineTime(raw)
  if (time === null) return '시간 확인 필요'
  const minutes = Math.ceil((time - Date.now()) / 60000)
  if (minutes <= 0) return '마감'
  return minutes < 60 ? minutes + '분 남음' : minutes < 1440 ? Math.floor(minutes / 60) + '시간 ' + minutes % 60 + '분 남음' : Math.ceil(minutes / 1440) + '일 남음'
}

function tagText(bid) {
  const s = signals(bid.summary || bid.title)
  const w = readWorkflow(bid.workflow_json, bid.summary || bid.title)
  return [w.seri.participating && '세리공영', w.jinyu.participating && '진유', s.joint && '지역공동도급', s.electric && '전기', s.telecom && '통신', s.yh && '관리자 yh', s.rate !== null && '하한율 ' + s.rate.toFixed(3) + '%', s.cancelled && '취소'].filter(Boolean).join(' · ')
}

function pendingText(bid) {
  const state = workState(bid)
  const words = [state.agreementPending && '협정 미완료', state.quotePending && '가격제시 미완료', state.submission && '투찰 미완료', state.needsConfirmation && '회사별 완료 확인 필요']
  return '<div class="text-xs text-orange-700 mb-1">' + words.filter(Boolean).join(' · ') + '</div>'
}

function kstDay(time) { return new Date(time + 9 * 3600000).toISOString().slice(0, 10) }
function matchesQuick(bid, filter) {
  const w = workState(bid)
  if (filter === 'today') return w.active && w.deadline !== null && kstDay(w.deadline) === kstDay(Date.now())
  if (filter === 'agreement') return w.agreementPending
  if (filter === 'quote') return w.quotePending
  if (filter === 'submission') return w.submission
  return true
}
function renderBids() {
  const company = document.getElementById('gcal-company').value
  const activeOnly = document.getElementById('gcal-period').value === 'active'
  const base = allBids.filter(b => !company || readWorkflow(b.workflow_json, b.summary || b.title)[company].participating)
  const items = base.filter(b => (!activeOnly || workState(b).active) && matchesQuick(b, quickFilter))
    .sort((a, b) => (deadlineTime(a.bid_deadline) ?? Infinity) - (deadlineTime(b.bid_deadline) ?? Infinity))
  const summary = document.getElementById('gcal-work-summary')
  summary.replaceChildren()
  for (const [key, label] of [['active', '진행 중'], ['today', '오늘 마감'], ['agreement', '협정 미완료'], ['quote', '가격제시 미완료'], ['submission', '투찰 미완료']]) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'bg-white rounded-lg shadow p-4 text-left border-2 ' + (quickFilter === key ? 'border-purple-600' : 'border-transparent')
    button.setAttribute('aria-pressed', String(quickFilter === key))
    const count = base.filter(b => key === 'active' ? workState(b).active : matchesQuick(b, key)).length
    button.innerHTML = '<span class="text-xs text-gray-500">' + label + '</span><strong class="block text-2xl mt-1">' + count + '</strong>'
    button.addEventListener('click', () => { quickFilter = key; document.getElementById('gcal-period').value = key === 'active' ? 'active' : 'all'; renderBids() })
    summary.append(button)
  }
  listBodyEl.replaceChildren()
  if (!items.length) listBodyEl.innerHTML = '<tr><td colspan="11" class="py-8 text-center text-gray-400">조건에 맞는 공고가 없습니다.</td></tr>'
  else items.forEach(b => listBodyEl.appendChild(renderRow(b)))
  resultCountEl.textContent = '표시 ' + items.length + '건 / 조회 ' + allBids.length + '건'
  const times = allBids.map(b => deadlineTime(b.synced_at && b.synced_at.replace(' ', 'T') + 'Z')).filter(t => t !== null)
  document.getElementById('gcal-sync-status').textContent = times.length ? '자료 최종 반영: ' + new Date(Math.max(...times)).toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}) + ' · KST · 캘린더 갱신은 동기화 버튼을 사용하세요.' : '아직 동기화 기록이 없습니다.'
}
async function loadBids() {
  const generation = ++loadGeneration
  listBodyEl.innerHTML = '<tr><td colspan="11" class="py-8 text-center text-gray-400">불러오는 중...</td></tr>'
  try {
    const items = []
    let total = Infinity
    while (items.length < total) {
      const query = new URLSearchParams(buildQuery())
      query.set('limit', '500'); query.set('offset', String(items.length))
      const res = await axios.get(GCAL_BID_API_BASE + '?' + query)
      if (generation !== loadGeneration) return
      const page = res.data.data || []
      items.push(...page)
      total = res.data.total ?? items.length
      if (!page.length) break
    }
    allBids = items
    renderBids()
  } catch (err) {
    if (generation !== loadGeneration) return
    allBids = []
    document.getElementById('gcal-work-summary').replaceChildren()
    resultCountEl.textContent = ''
    document.getElementById('gcal-sync-status').textContent = '목록 조회 실패. 최신 자료를 확인할 수 없습니다.'
    listBodyEl.innerHTML = '<tr><td colspan="11" class="py-8 text-center text-red-500">불러오기에 실패했습니다. 잠시 후 다시 조회해 주세요.</td></tr>'
  }
}

function renderWorkEditor() {
  const w = readWorkflow(editingBid.workflow_json, editingBid.summary || editingBid.title)
  const s = signals(editingBid.summary || editingBid.title)
  const host = document.getElementById('gcal-work-editor')
  host.innerHTML = '<h4 class="font-semibold mb-2">회사별 업무</h4><p class="text-xs text-gray-500 mb-3">기존 제출완료·적색 표시는 유지됩니다. 회사별 완료 여부는 각각 확인해 주세요.</p>' +
    ['seri', 'jinyu'].map(key => '<fieldset class="border rounded p-2 mb-2"><legend>' + (key === 'seri' ? '세리공영' : '진유') + '</legend>' +
      [['participating', '참가'], ['agreement_done', '협정완료'], ['submitted', '투찰완료']].map(([field, label]) => '<label class="inline-flex gap-1 mr-3 text-sm"><input type="checkbox" id="work-' + key + '-' + field + '" ' + (w[key][field] ? 'checked' : '') + '>' + label + '</label>').join('') + '</fieldset>').join('') +
    '<h4 class="font-semibold mt-4 mb-2">가격제시 대상 업체</h4>' +
    (s.quote ? '<p class="text-xs text-orange-700 mb-2"># 표시가 있습니다. 원문에서 업체명을 확인해 등록하세요.</p>' : '') +
    '<div id="work-quotes"></div><button type="button" id="work-add-quote" class="text-sm text-purple-700 my-2">+ 업체 추가</button><label class="block text-sm"><input id="work-quote-reviewed" type="checkbox" ' + (w.quote_reviewed ? 'checked' : '') + '> 가격제시 대상 확인 완료</label>'
  w.quotes.forEach(addQuoteRow)
  document.getElementById('work-add-quote').addEventListener('click', () => addQuoteRow({company: '', done: false}))
}
function addQuoteRow(quote) {
  const row = document.createElement('div')
  row.className = 'flex gap-2 items-center mb-2'
  row.innerHTML = '<input aria-label="가격제시 업체명" maxlength="100" class="quote-company border rounded p-1 min-w-0 flex-1" value="' + escapeHtml(quote.company) + '"><label class="text-sm whitespace-nowrap"><input type="checkbox" class="quote-done" ' + (quote.done ? 'checked' : '') + '> 제시완료</label><button type="button" class="text-gray-500 text-sm">삭제</button>'
  row.querySelector('button').addEventListener('click', () => row.remove())
  document.getElementById('work-quotes').append(row)
}
function collectWorkflow() {
  const w = {quotes: [], quote_reviewed: document.getElementById('work-quote-reviewed').checked}
  for (const key of ['seri', 'jinyu']) {
    w[key] = {}
    for (const field of ['participating', 'agreement_done', 'submitted']) w[key][field] = document.getElementById('work-' + key + '-' + field).checked
  }
  for (const row of document.getElementById('work-quotes').children) {
    const company = row.querySelector('.quote-company').value.trim()
    if (!company) throw Error('가격제시 업체명을 입력하거나 빈 행을 삭제해 주세요.')
    w.quotes.push({company, done: row.querySelector('.quote-done').checked})
  }
  return w
}

function openEditModal(bid) {
  editingBid = bid
  renderWorkEditor()
  editEventIdEl.value = bid.event_id
  editBidTitleEl.textContent = bid.title || ''
  editStatusEl.value = bid.status || '검토중'
  editAssigneeEl.value = bid.assignee || ''
  editMemoEl.value = bid.memo || ''

  modalEl.classList.remove('hidden')
  modalEl.classList.add('flex')
}

function closeEditModal() {
  modalEl.classList.add('hidden')
  modalEl.classList.remove('flex')
}

async function saveStatus() {
  const eventId = editEventIdEl.value
  editSaveBtn.disabled = true
  let workflowSaved = false
  try {
    const workflow = collectWorkflow()
    await axios.put(GCAL_BID_API_BASE + '/' + encodeURIComponent(eventId) + '/workflow', {
      workflow, expected: editingBid.workflow_json || null
    })
    editingBid.workflow_json = JSON.stringify(workflow)
    workflowSaved = true
    await axios.put(GCAL_BID_API_BASE + '/' + encodeURIComponent(eventId) + '/status', {
      status: editStatusEl.value, assignee: editAssigneeEl.value, memo: editMemoEl.value
    })
    closeEditModal()
    await loadBids()
  } catch (err) {
    alert((workflowSaved ? '회사별 업무는 저장됐습니다. 상태·메모 저장을 다시 시도해 주세요. ' : '') + (err.response?.data?.error || err.message))
  } finally { editSaveBtn.disabled = false }
}

async function syncCalendar() {
  syncBtn.disabled = true
  const originalHtml = syncBtn.innerHTML
  syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>동기화 중...'
  try {
    const res = await axios.post(`${GCAL_BID_API_BASE}/sync`)
    alert(`캘린더 동기화 완료: ${res.data.fetched}건 조회, ${res.data.synced}건 반영`)
    await loadBids()
  } catch (err) {
    console.error('캘린더 동기화 실패:', err)
    const msg = err.response?.data?.error || err.message
    alert(`캘린더 동기화에 실패했습니다: ${msg}`)
  } finally {
    syncBtn.disabled = false
    syncBtn.innerHTML = originalHtml
  }
}

// =====================================================================
// 입찰가 계산기 모달 로직
// =====================================================================

const HAHAN_DEFAULTS = {
  jeokgyeok: 87.745,   // 적격심사(공사)
  choejeo: 87.745,     // 최저가
  service: 90.0,       // 용역 적격심사
  goods: 88.0,         // 물품
}

/** "1,234,567,890원" 같은 문자열 -> 숫자로 변환 */
function parseAmountStr(str) {
  if (!str) return null
  const n = parseFloat(str.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? null : n
}

/** 숫자 -> "1,234,567,890 원" */
function fmtWon(n) {
  if (n === null || n === undefined || isNaN(n)) return '-'
  return Math.round(n).toLocaleString('ko-KR') + ' 원'
}

function fmtRate(n) {
  return n.toFixed(3) + '%'
}

/** 낙찰방법 문자열에서 하한율 타입 추정 */
function inferHahanType(bidMethod) {
  if (!bidMethod) return 'jeokgyeok'
  if (bidMethod.includes('최저가')) return 'choejeo'
  if (bidMethod.includes('용역') || bidMethod.includes('서비스')) return 'service'
  if (bidMethod.includes('물품')) return 'goods'
  return 'jeokgyeok'
}

function openCalcModal(bid) {
  // 제목
  calcTitleEl.textContent = bid.title || '(공고명 없음)'

  // 기초금액 파싱
  const amount = parseAmountStr(bid.base_amount)
  calcBaseAmountEl.value = amount !== null ? Math.round(amount).toLocaleString('ko-KR') : ''
  calcBaseAmountEl.dataset.raw = bid.base_amount || ''

  // 낙찰방법
  calcBidMethodEl.textContent = bid.bid_method || '-'

  // 낙찰하한율: 공고에서 파싱된 값 우선 사용, 없으면 방법에서 추정
  let hahanRate = null
  if (bid.lower_rate) {
    const m = String(bid.lower_rate).match(/[\d.]+/)
    if (m) hahanRate = parseFloat(m[0])
  }
  if (!hahanRate || isNaN(hahanRate)) hahanRate = signals(bid.summary || bid.title).rate
  if (!hahanRate || isNaN(hahanRate)) {
    const type = inferHahanType(bid.bid_method)
    hahanRate = HAHAN_DEFAULTS[type]
  }
  calcHahanRateEl.value = hahanRate.toFixed(3)

  // 초기화
  calcDirectRateEl.value = ''
  calcTargetScoreEl.value = '9.5'
  calcCustomScoreGroupEl.style.display = 'none'
  calcResultEl.classList.add('hidden')
  calcRateTableBodyEl.innerHTML = ''

  // 모달 오픈
  calcModalEl.classList.remove('hidden')
  calcModalEl.classList.add('flex')
}

function closeCalcModal() {
  calcModalEl.classList.add('hidden')
  calcModalEl.classList.remove('flex')
}

function runCalc() {
  const rawStr = calcBaseAmountEl.value.replace(/,/g, '')
  const yejung = parseFloat(rawStr)
  if (!yejung || isNaN(yejung)) {
    alert('기초금액(예정가격)을 입력하세요.')
    return
  }

  const hahanRate = parseFloat(calcHahanRateEl.value)
  if (isNaN(hahanRate)) {
    alert('낙찰하한율을 입력하세요.')
    return
  }

  const hahanPrice = yejung * hahanRate / 100

  // 목표점수 -> 권장 입찰율
  let targetScore
  const ts = calcTargetScoreEl.value
  if (ts === 'custom') {
    targetScore = parseFloat(calcCustomScoreEl.value)
  } else {
    targetScore = parseFloat(ts)
  }
  const recommendRate = (10 * hahanRate) / targetScore
  const recommendPrice = yejung * recommendRate / 100

  // 직접 입력 비율
  const directRate = parseFloat(calcDirectRateEl.value)
  const directPrice = !isNaN(directRate) && directRate > 0 ? yejung * directRate / 100 : null

  // 결과 표시
  document.getElementById('calc-res-yejung').textContent = fmtWon(yejung)
  document.getElementById('calc-res-hahan').textContent = fmtWon(hahanPrice)
  document.getElementById('calc-res-hahan-rate').textContent = fmtRate(hahanRate) + ' 기준'
  document.getElementById('calc-res-recommend').textContent = fmtWon(recommendPrice)
  document.getElementById('calc-res-recommend-sub').textContent = fmtRate(recommendRate) + ' · 가격점수 ' + targetScore + '점'
  document.getElementById('calc-res-direct').textContent = directPrice ? fmtWon(directPrice) : '미입력'
  document.getElementById('calc-res-direct-sub').textContent = !isNaN(directRate) && directRate > 0 ? fmtRate(directRate) : ''

  calcResultEl.classList.remove('hidden')

  // 시뮬레이션 테이블 생성
  buildCalcTable(yejung, hahanRate, recommendRate)
}

function buildCalcTable(yejung, hahanRate, selectedRate) {
  calcRateTableBodyEl.innerHTML = ''
  for (let r = hahanRate; r <= hahanRate + 5.001; r += 0.5) {
    const rate = parseFloat(r.toFixed(3))
    const price = yejung * rate / 100
    const score = Math.min(10, (10 * hahanRate / rate)).toFixed(2)
    const isSelected = Math.abs(rate - selectedRate) < 0.01
    const isHahan = rate === parseFloat(hahanRate.toFixed(3))
    const note = isHahan ? '⚠️ 하한율' : isSelected ? '✅ 권장' : ''
    const tr = document.createElement('tr')
    if (isSelected) tr.className = 'bg-blue-50 font-semibold'
    tr.innerHTML = `
      <td class="py-1.5 px-3 text-center">${rate.toFixed(3)}%</td>
      <td class="py-1.5 px-3 text-right">${Math.round(price).toLocaleString('ko-KR')}</td>
      <td class="py-1.5 px-3 text-center">${score}점</td>
      <td class="py-1.5 px-3 text-center text-xs">${note}</td>
    `
    calcRateTableBodyEl.appendChild(tr)
  }
}

// target score 변경 시 custom 입력 토글
calcTargetScoreEl?.addEventListener('change', function () {
  calcCustomScoreGroupEl.style.display = this.value === 'custom' ? '' : 'none'
})

// 기초금액 콤마 포맷
calcBaseAmountEl?.addEventListener('input', function () {
  const raw = this.value.replace(/[^0-9]/g, '')
  this.value = raw ? parseInt(raw).toLocaleString('ko-KR') : ''
})

calcRunBtn?.addEventListener('click', runCalc)
calcCloseBtn?.addEventListener('click', closeCalcModal)
calcModalEl?.addEventListener('click', (e) => {
  if (e.target === calcModalEl) closeCalcModal()
})

// =====================================================================

filterApplyBtn?.addEventListener('click', loadBids)
filterResetBtn?.addEventListener('click', () => {
  quickFilter = 'active'
  document.getElementById('gcal-company').value = ''
  document.getElementById('gcal-period').value = 'active'
  filterStatusEl.value = ''
  filterRegionEl.value = ''
  filterIndustryEl.value = ''
  filterQEl.value = ''
  loadBids()
})
syncBtn?.addEventListener('click', syncCalendar)
;[filterQEl].forEach((el) => {
  el?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loadBids()
  })
})

editSaveBtn?.addEventListener('click', saveStatus)
editCancelBtn?.addEventListener('click', closeEditModal)
modalEl?.addEventListener('click', (e) => {
  if (e.target === modalEl) closeEditModal()
})

document.getElementById('gcal-company').addEventListener('change', renderBids)
document.getElementById('gcal-period').addEventListener('change', () => { quickFilter = 'active'; renderBids() })
// Refresh countdowns without silently mutating calendar or workflow data.
setInterval(() => { if (allBids.length) renderBids() }, 60000)

// 초기 로드
loadBids()

