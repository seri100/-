// 구글 캘린더 기준 입찰 관리 대시보드 프론트엔드 스크립트
const GCAL_BID_API_BASE = '/api/gcal-bids'

const listBodyEl = document.getElementById('gcal-bid-list-body')
const resultCountEl = document.getElementById('gcal-result-count')

const filterStatusEl = document.getElementById('gcal-filter-status')
const filterRegionEl = document.getElementById('gcal-filter-region')
const filterIndustryEl = document.getElementById('gcal-filter-industry')
const filterQEl = document.getElementById('gcal-filter-q')
const filterDateFromEl = document.getElementById('gcal-filter-date-from')
const filterDateToEl = document.getElementById('gcal-filter-date-to')
const filterApplyBtn = document.getElementById('gcal-filter-apply-btn')
const filterResetBtn = document.getElementById('gcal-filter-reset-btn')
const syncBtn = document.getElementById('gcal-sync-btn')

const modalEl = document.getElementById('gcal-edit-modal')
const editEventIdEl = document.getElementById('gcal-edit-event-id')
const editBidTitleEl = document.getElementById('gcal-edit-bid-title')
const editCalendarTagsEl = document.getElementById('gcal-edit-calendar-tags')
const editStatusEl = document.getElementById('gcal-edit-status')
const editAssigneeEl = document.getElementById('gcal-edit-assignee')
const editMemoEl = document.getElementById('gcal-edit-memo')
const editSaveBtn = document.getElementById('gcal-edit-save-btn')
const editCancelBtn = document.getElementById('gcal-edit-cancel-btn')

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

// 날짜/시각 문자열의 4자리 연도(20xx)를 2자리(xx)로 축약해 표시 폭을 줄인다.
// 예: "2026-08-18 00:00:00" -> "26-08-18 00:00:00"
function shortenYear(v) {
  if (!v) return v
  return String(v).replace(/\b20(\d{2})([-/])/g, '$1$2')
}

function formatDate(v) {
  if (!v) return '-'
  return shortenYear(v)
}

// 금액 문자열에서 숫자만 추출해 천원 단위로 환산 표시한다.
// 예: "422,928,000원 (사억이천이백구십이만팔천원)" -> "422,928천원"
function formatAmountThousand(v) {
  if (!v) return '-'
  const m = String(v).match(/[\d,]+/)
  if (!m) return v
  const num = parseInt(m[0].replace(/,/g, ''), 10)
  if (Number.isNaN(num)) return v
  const thousand = Math.round(num / 1000)
  return thousand.toLocaleString('ko-KR') + '천원'
}

function shortIndustry(v) {
  if (!v) return '-'
  const s = String(v)
  if (s.includes('소방')) return '소방'
  if (s.includes('기계')) return '기계'
  if (s.includes('전기')) return '전기'
  // 위 세 카테고리에 해당하지 않는 경우(낙찰방법 텍스트 등 잘못 파싱된 값) 원문 일부만 표시
  return s.length > 6 ? s.slice(0, 6) + '…' : s
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

  tr.innerHTML = `
    <td class="py-2 px-3">
      <button class="gcal-status-edit-btn" data-event-id="${escapeHtml(bid.event_id)}">
        ${statusBadge(bid.status)}
      </button>
    </td>
    <td class="py-2 px-3">
      <span class="line-clamp-2" title="${escapeHtml(bid.title)}">${escapeHtml(bid.title)}</span>
    </td>
    <td class="py-2 px-3 truncate" title="${escapeHtml(bid.agency)}">${escapeHtml(bid.agency)}</td>
    <td class="py-2 px-3">
      <span class="line-clamp-2" title="${escapeHtml(bid.participant_region)}">${escapeHtml(bid.participant_region)}</span>
    </td>
    <td class="py-2 px-3 whitespace-nowrap" title="${escapeHtml(bid.industry)}">${shortIndustry(bid.industry)}</td>
    <td class="py-2 px-3 whitespace-nowrap" title="${escapeHtml(bid.base_amount)}">${formatAmountThousand(bid.base_amount)}</td>
    <td class="py-2 px-3 whitespace-nowrap" title="${escapeHtml(bid.bid_open_recv_date)}">${formatDate(bid.bid_open_recv_date)}</td>
    <td class="py-2 px-3 whitespace-nowrap" title="${escapeHtml(bid.bid_deadline)}">${formatDate(bid.bid_deadline)}</td>
    <td class="py-2 px-3 whitespace-nowrap">${escapeHtml(bid.assignee)}</td>
    <td class="py-2 px-3 max-w-[160px]">
      ${bid.calendar_tags ? `<div class="text-[11px] text-blue-600 mb-0.5" title="${escapeHtml(bid.calendar_tags)}"><i class="fas fa-tag mr-0.5"></i>${escapeHtml(bid.calendar_tags)}</div>` : ''}
      <span class="line-clamp-2 text-gray-500" title="${escapeHtml(bid.memo)}">${escapeHtml(bid.memo)}</span>
    </td>
    <td class="py-2 px-3">
      ${bid.detail_url ? `<a href="${escapeHtml(bid.detail_url)}" target="_blank" rel="noopener" class="text-blue-600 hover:underline"><i class="fas fa-external-link-alt"></i></a>` : '-'}
    </td>
  `

  const editBtn = tr.querySelector('.gcal-status-edit-btn')
  editBtn.addEventListener('click', () => openEditModal(bid))

  return tr
}

function buildQuery() {
  const params = new URLSearchParams()
  if (filterStatusEl.value) params.set('status', filterStatusEl.value)
  if (filterRegionEl.value.trim()) params.set('region', filterRegionEl.value.trim())
  if (filterIndustryEl.value.trim()) params.set('industry', filterIndustryEl.value.trim())
  if (filterDateFromEl.value) params.set('date_from', filterDateFromEl.value)
  if (filterDateToEl.value) params.set('date_to', filterDateToEl.value)
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
      listBodyEl.innerHTML = '<tr><td colspan="11" class="py-8 text-center text-gray-400">조건에 맞는 공고가 없습니다. (검색 조건을 바꿔보시거나, 데이터가 아직 없다면 우측 상단 "캘린더 동기화" 버튼을 눌러주세요)</td></tr>'
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
  if (bid.calendar_tags) {
    editCalendarTagsEl.querySelector('span').textContent = bid.calendar_tags
    editCalendarTagsEl.classList.remove('hidden')
  } else {
    editCalendarTagsEl.classList.add('hidden')
  }
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
    const reparsedNote = res.data.reparsed_updated ? `, 과거건 재분류 ${res.data.reparsed_updated}건` : ''
    const promotedNote = res.data.promoted ? `, 적색표시 제출완료 자동전환 ${res.data.promoted}건` : ''
    alert(`캘린더 동기화 완료: ${res.data.fetched}건 조회, ${res.data.synced}건 반영${promotedNote}${reparsedNote}`)
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

filterApplyBtn?.addEventListener('click', loadBids)
filterResetBtn?.addEventListener('click', () => {
  filterStatusEl.value = ''
  filterRegionEl.value = ''
  filterIndustryEl.value = ''
  filterDateFromEl.value = ''
  filterDateToEl.value = ''
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
