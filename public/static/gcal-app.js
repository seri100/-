// 구글 캘린더 기준 입찰 관리 대시보드 프론트엔드 스크립트
const GCAL_BID_API_BASE = '/api/gcal-bids'

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
      ${calcBtn}
    </td>
    <td class="py-2 px-3 whitespace-nowrap">${escapeHtml(bid.agency)}</td>
    <td class="py-2 px-3 whitespace-nowrap">${escapeHtml(bid.participant_region)}</td>
    <td class="py-2 px-3 whitespace-nowrap">${escapeHtml(bid.industry)}</td>
    <td class="py-2 px-3 whitespace-nowrap">${escapeHtml(bid.base_amount)}</td>
    <td class="py-2 px-3 whitespace-nowrap">${formatText(bid.bid_open_recv_date)}</td>
    <td class="py-2 px-3 whitespace-nowrap">${formatText(bid.bid_deadline)}</td>
    <td class="py-2 px-3 whitespace-nowrap">${escapeHtml(bid.assignee)}</td>
    <td class="py-2 px-3 max-w-[160px]">
      <span class="line-clamp-2 text-gray-500" title="${escapeHtml(bid.memo)}">${escapeHtml(bid.memo)}</span>
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

async function loadBids() {
  listBodyEl.innerHTML = '<tr><td colspan="11" class="py-8 text-center text-gray-400">불러오는 중...</td></tr>'
  try {
    const qs = buildQuery()
    const res = await axios.get(`${GCAL_BID_API_BASE}${qs ? '?' + qs : ''}`)
    const items = res.data.data || []

    listBodyEl.innerHTML = ''
    if (items.length === 0) {
      listBodyEl.innerHTML = '<tr><td colspan="11" class="py-8 text-center text-gray-400">조건에 맞는 공고가 없습니다. (우측 상단 "캘린더 동기화" 버튼으로 먼저 불러오세요)</td></tr>'
    } else {
      items.forEach((bid) => listBodyEl.appendChild(renderRow(bid)))
    }
    resultCountEl.textContent = `총 ${items.length}건`
  } catch (err) {
    console.error('구글 캘린더 입찰 목록 조회 실패:', err)
    listBodyEl.innerHTML = '<tr><td colspan="11" class="py-8 text-center text-red-400">불러오기에 실패했습니다.</td></tr>'
  }
}

function openEditModal(bid) {
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

  try {
    await axios.put(`${GCAL_BID_API_BASE}/${encodeURIComponent(eventId)}/status`, {
      status: editStatusEl.value,
      assignee: editAssigneeEl.value,
      memo: editMemoEl.value
    })
    closeEditModal()
    await loadBids()
  } catch (err) {
    console.error('상태 저장 실패:', err)
    alert('저장에 실패했습니다. 콘솔 로그를 확인해주세요.')
  }
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

// 초기 로드
loadBids()
