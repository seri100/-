// 입찰 관리 대시보드 프론트엔드 스크립트
const BID_API_BASE = '/api/bids'

const listBodyEl = document.getElementById('bid-list-body')
const resultCountEl = document.getElementById('result-count')

const filterStatusEl = document.getElementById('filter-status')
const filterRegionEl = document.getElementById('filter-region')
const filterIndustryEl = document.getElementById('filter-industry')
const filterQEl = document.getElementById('filter-q')
const filterDateFromEl = document.getElementById('filter-date-from')
const filterDateToEl = document.getElementById('filter-date-to')
const filterApplyBtn = document.getElementById('filter-apply-btn')
const filterResetBtn = document.getElementById('filter-reset-btn')

const modalEl = document.getElementById('edit-modal')
const editBidNoEl = document.getElementById('edit-bid-no')
const editBidOrdEl = document.getElementById('edit-bid-ord')
const editBidTitleEl = document.getElementById('edit-bid-title')
const editStatusEl = document.getElementById('edit-status')
const editAssigneeEl = document.getElementById('edit-assignee')
const editMemoEl = document.getElementById('edit-memo')
const editSaveBtn = document.getElementById('edit-save-btn')
const editCancelBtn = document.getElementById('edit-cancel-btn')

function escapeHtml(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDeadline(v) {
  if (!v) return '-'
  // 원본 포맷을 그대로 보여주되, 너무 길면 자르지 않고 그대로 표시
  return v
}

function shortIndustry(v) {
  if (!v) return '-'
  const s = String(v)
  if (s.includes('소방')) return '소방'
  if (s.includes('기계')) return '기계'
  if (s.includes('전기')) return '전기'
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
      <button class="status-edit-btn" data-bid-no="${escapeHtml(bid.bid_no)}" data-bid-ord="${escapeHtml(bid.bid_ord)}">
        ${statusBadge(bid.status)}
      </button>
    </td>
    <td class="py-2 px-3">
      <span class="line-clamp-2" title="${escapeHtml(bid.title)}">${escapeHtml(bid.title)}</span>
    </td>
    <td class="py-2 px-3 truncate" title="${escapeHtml(bid.agency)}">${escapeHtml(bid.agency)}</td>
    <td class="py-2 px-3">
      <span class="line-clamp-2" title="${escapeHtml(bid.region)}">${escapeHtml(bid.region)}</span>
    </td>
    <td class="py-2 px-3 whitespace-nowrap" title="${escapeHtml(bid.main_industry)}">${shortIndustry(bid.main_industry)}</td>
    <td class="py-2 px-3 whitespace-nowrap">${escapeHtml(bid.estimated_price)}</td>
    <td class="py-2 px-3 whitespace-nowrap">${formatDeadline(bid.bid_open_recv_date)}</td>
    <td class="py-2 px-3 whitespace-nowrap">${formatDeadline(bid.bid_deadline)}</td>
    <td class="py-2 px-3 whitespace-nowrap">${escapeHtml(bid.assignee)}</td>
    <td class="py-2 px-3 max-w-[160px]">
      <span class="line-clamp-2 text-gray-500" title="${escapeHtml(bid.memo)}">${escapeHtml(bid.memo)}</span>
    </td>
    <td class="py-2 px-3">
      ${bid.detail_url ? `<a href="${escapeHtml(bid.detail_url)}" target="_blank" rel="noopener" class="text-blue-600 hover:underline"><i class="fas fa-external-link-alt"></i></a>` : '-'}
    </td>
  `

  const editBtn = tr.querySelector('.status-edit-btn')
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
    const res = await axios.get(`${BID_API_BASE}${qs ? '?' + qs : ''}`)
    const items = res.data.data || []

    listBodyEl.innerHTML = ''
    if (items.length === 0) {
      listBodyEl.innerHTML = '<tr><td colspan="11" class="py-8 text-center text-gray-400">조건에 맞는 공고가 없습니다.</td></tr>'
    } else {
      items.forEach((bid) => listBodyEl.appendChild(renderRow(bid)))
    }
    resultCountEl.textContent = `총 ${items.length}건`
  } catch (err) {
    console.error('입찰 목록 조회 실패:', err)
    listBodyEl.innerHTML = '<tr><td colspan="11" class="py-8 text-center text-red-400">불러오기에 실패했습니다.</td></tr>'
  }
}

function openEditModal(bid) {
  editBidNoEl.value = bid.bid_no
  editBidOrdEl.value = bid.bid_ord
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
  const bidNo = editBidNoEl.value
  const bidOrd = editBidOrdEl.value

  try {
    await axios.put(`${BID_API_BASE}/${encodeURIComponent(bidNo)}/${encodeURIComponent(bidOrd)}/status`, {
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
;[filterRegionEl, filterIndustryEl, filterQEl].forEach((el) => {
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
