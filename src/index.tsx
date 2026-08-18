import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { renderer } from './renderer'
import { syncGcalBids } from './gcal'

type Bindings = {
  DB: D1Database
  IMPORT_API_KEY: string // 라즈베리파이 업로드 스크립트 인증용 (wrangler secret / .dev.vars)
  GCAL_SERVICE_ACCOUNT_JSON?: string // 구글 캘린더 서비스 계정 키(JSON 전체) - wrangler secret
  GCAL_CALENDAR_ID?: string          // 구글 캘린더 ID (기본값: gcal.ts의 DEFAULT_CALENDAR_ID)
}

const app = new Hono<{ Bindings: Bindings }>()

// API 전용 CORS 허용 (프론트-백엔드 분리 아키텍처를 가정)
app.use('/api/*', cors())

// ------------------------------------------------------------------
// 지역명 동의어 매핑
//   - 캘린더/원본 데이터에 "충북"(축약형)과 "충청북도"(정식명칭)가
//     혼재되어 있어, 필터 드롭다운 값 하나로 두 형태를 모두 매칭해야 한다.
// ------------------------------------------------------------------
const REGION_SYNONYMS: Record<string, string[]> = {
  '충북': ['충북', '충청북도'],
  '충남': ['충남', '충청남도'],
  '전북': ['전북', '전라북도'],
  '전남': ['전남', '전라남도'],
  '경북': ['경북', '경상북도'],
  '경남': ['경남', '경상남도'],
  '서울': ['서울', '서울특별시'],
  '부산': ['부산', '부산광역시'],
  '대구': ['대구', '대구광역시'],
  '인천': ['인천', '인천광역시'],
  '광주': ['광주', '광주광역시'],
  '대전': ['대전', '대전광역시'],
  '울산': ['울산', '울산광역시'],
  '세종': ['세종', '세종특별자치시'],
  '경기': ['경기', '경기도'],
  '강원': ['강원', '강원도', '강원특별자치도'],
  '제주': ['제주', '제주도', '제주특별자치도']
}

function regionVariants(region: string): string[] {
  return REGION_SYNONYMS[region] || [region]
}

// ==================================================================
// REST API: 입찰 관리 (bids + bid_status)
//   - bids: 라즈베리파이가 gongo/*.csv를 매일 업로드하는 원본 미러
//   - bid_status: 웹 화면에서 3인이 직접 입력하는 상태(검토중/제출완료)
// ==================================================================

// 라즈베리파이 업로드 전용 인증 미들웨어 (X-API-Key 헤더)
const requireImportKey = async (c: any, next: any) => {
  const key = c.req.header('X-API-Key')
  if (!c.env.IMPORT_API_KEY || key !== c.env.IMPORT_API_KEY) {
    return c.json({ success: false, error: 'Unauthorized: invalid X-API-Key' }, 401)
  }
  await next()
}

// [POST] /api/bids/import - 라즈베리파이 gongo CSV 데이터 대량 upsert
// body: { items: [{ bid_no, bid_ord, category, title, agency, demand_agency,
//                    main_industry, region, bid_method, contract_method,
//                    estimated_price, budget_amount, notice_date,
//                    bid_deadline, open_date, bid_open_recv_date,
//                    detail_url, collected_at }, ...] }
app.post('/api/bids/import', requireImportKey, async (c) => {
  const { env } = c
  const body = await c.req.json().catch(() => null)

  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ success: false, error: 'items(array) is required' }, 400)
  }

  const items = body.items
  const MAX_BATCH = 200
  if (items.length > MAX_BATCH) {
    return c.json({ success: false, error: `items exceeds max batch size (${MAX_BATCH})` }, 400)
  }

  const stmt = env.DB.prepare(`
    INSERT INTO bids (
      bid_no, bid_ord, category, title, agency, demand_agency, main_industry,
      region, bid_method, contract_method, estimated_price, budget_amount,
      notice_date, bid_deadline, open_date, bid_open_recv_date, detail_url, collected_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(bid_no, bid_ord) DO UPDATE SET
      category = excluded.category,
      title = excluded.title,
      agency = excluded.agency,
      demand_agency = excluded.demand_agency,
      main_industry = excluded.main_industry,
      region = excluded.region,
      bid_method = excluded.bid_method,
      contract_method = excluded.contract_method,
      estimated_price = excluded.estimated_price,
      budget_amount = excluded.budget_amount,
      notice_date = excluded.notice_date,
      bid_deadline = excluded.bid_deadline,
      open_date = excluded.open_date,
      bid_open_recv_date = excluded.bid_open_recv_date,
      detail_url = excluded.detail_url,
      collected_at = excluded.collected_at,
      updated_at = datetime('now')
  `)

  const batch = items.map((it: any) =>
    stmt.bind(
      String(it.bid_no ?? ''),
      String(it.bid_ord ?? ''),
      it.category ?? null,
      it.title ?? null,
      it.agency ?? null,
      it.demand_agency ?? null,
      it.main_industry ?? null,
      it.region ?? null,
      it.bid_method ?? null,
      it.contract_method ?? null,
      it.estimated_price ?? null,
      it.budget_amount ?? null,
      it.notice_date ?? null,
      it.bid_deadline ?? null,
      it.open_date ?? null,
      it.bid_open_recv_date ?? null,
      it.detail_url ?? null,
      it.collected_at ?? null
    )
  )

  // 필수 키(bid_no, bid_ord) 누락 항목 사전 검증
  const invalid = items.findIndex((it: any) => !it.bid_no || !it.bid_ord)
  if (invalid !== -1) {
    return c.json({ success: false, error: `items[${invalid}] missing bid_no/bid_ord` }, 400)
  }

  await env.DB.batch(batch)

  return c.json({ success: true, imported: items.length })
})

// [GET] /api/bids - 목록 조회 (bids + bid_status LEFT JOIN)
// 쿼리 파라미터: status, region, industry, q(제목 검색), limit, offset
app.get('/api/bids', async (c) => {
  const { env } = c
  const status = c.req.query('status')       // '검토중' | '제출완료'
  const region = c.req.query('region')
  const industry = c.req.query('industry')   // '기계' | '소방' | '전기' (실제 컬럼값의 부분 키워드로 매칭)
  const dateFrom = c.req.query('date_from')  // 'YYYY-MM-DD', 입찰마감일 기준
  const dateTo = c.req.query('date_to')      // 'YYYY-MM-DD', 입찰마감일 기준
  const q = c.req.query('q')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10) || 100, 500)
  const offset = parseInt(c.req.query('offset') ?? '0', 10) || 0

  let query = `
    SELECT
      b.*,
      COALESCE(s.status, '검토중') AS status,
      s.assignee,
      s.memo,
      s.updated_by,
      s.updated_at AS status_updated_at
    FROM bids b
    LEFT JOIN bid_status s ON b.bid_no = s.bid_no AND b.bid_ord = s.bid_ord
    WHERE 1=1
  `
  const params: any[] = []

  if (status === '검토중' || status === '제출완료') {
    query += ` AND COALESCE(s.status, '검토중') = ?`
    params.push(status)
  }
  if (region) {
    // "충북"/"충청북도"처럼 축약형·정식명칭이 혼재하므로 동의어를 모두 OR로 매칭
    const variants = regionVariants(region)
    query += ` AND (${variants.map(() => `b.region LIKE ?`).join(' OR ')})`
    params.push(...variants.map((v) => `%${v}%`))
  }
  if (industry) {
    // 실제 저장값이 "전문소방시설공사업", "기계설비공사업", "전기설비" 등으로 다양하므로
    // 드롭다운의 짧은 키워드(기계/소방/전기)를 그대로 부분일치시킨다.
    query += ` AND b.main_industry LIKE ?`
    params.push(`%${industry}%`)
  }
  if (dateFrom) {
    query += ` AND substr(b.bid_deadline, 1, 10) >= ?`
    params.push(dateFrom)
  }
  if (dateTo) {
    query += ` AND substr(b.bid_deadline, 1, 10) <= ?`
    params.push(dateTo)
  }
  if (q) {
    query += ` AND b.title LIKE ?`
    params.push(`%${q}%`)
  }

  query += ` ORDER BY b.bid_deadline ASC LIMIT ? OFFSET ?`
  params.push(limit, offset)

  const { results } = await env.DB.prepare(query).bind(...params).all()

  return c.json({ success: true, data: results, count: results.length })
})

// [GET] /api/bids/:bid_no/:bid_ord - 단일 조회
app.get('/api/bids/:bid_no/:bid_ord', async (c) => {
  const { env } = c
  const bidNo = c.req.param('bid_no')
  const bidOrd = c.req.param('bid_ord')

  const bid = await env.DB.prepare(`
    SELECT
      b.*,
      COALESCE(s.status, '검토중') AS status,
      s.assignee,
      s.memo,
      s.updated_by,
      s.updated_at AS status_updated_at
    FROM bids b
    LEFT JOIN bid_status s ON b.bid_no = s.bid_no AND b.bid_ord = s.bid_ord
    WHERE b.bid_no = ? AND b.bid_ord = ?
  `).bind(bidNo, bidOrd).first()

  if (!bid) {
    return c.json({ success: false, error: 'Bid not found' }, 404)
  }

  return c.json({ success: true, data: bid })
})

// [PUT] /api/bids/:bid_no/:bid_ord/status - 상태 변경 (검토중/제출완료, 담당자, 메모)
app.put('/api/bids/:bid_no/:bid_ord/status', async (c) => {
  const { env } = c
  const bidNo = c.req.param('bid_no')
  const bidOrd = c.req.param('bid_ord')
  const body = await c.req.json().catch(() => null)

  const bid = await env.DB.prepare('SELECT 1 FROM bids WHERE bid_no = ? AND bid_ord = ?')
    .bind(bidNo, bidOrd)
    .first()

  if (!bid) {
    return c.json({ success: false, error: 'Bid not found' }, 404)
  }

  if (body?.status !== undefined && body.status !== '검토중' && body.status !== '제출완료') {
    return c.json({ success: false, error: "status must be '검토중' or '제출완료'" }, 400)
  }

  const existing = await env.DB.prepare('SELECT * FROM bid_status WHERE bid_no = ? AND bid_ord = ?')
    .bind(bidNo, bidOrd)
    .first()

  const status = body?.status ?? existing?.status ?? '검토중'
  const assignee = body?.assignee !== undefined ? body.assignee : (existing?.assignee ?? null)
  const memo = body?.memo !== undefined ? body.memo : (existing?.memo ?? null)
  const updatedBy = body?.updated_by !== undefined ? body.updated_by : (existing?.updated_by ?? null)

  await env.DB.prepare(`
    INSERT INTO bid_status (bid_no, bid_ord, status, assignee, memo, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(bid_no, bid_ord) DO UPDATE SET
      status = excluded.status,
      assignee = excluded.assignee,
      memo = excluded.memo,
      updated_by = excluded.updated_by,
      updated_at = datetime('now')
  `).bind(bidNo, bidOrd, status, assignee, memo, updatedBy).run()

  const updated = await env.DB.prepare(`
    SELECT
      b.*,
      COALESCE(s.status, '검토중') AS status,
      s.assignee,
      s.memo,
      s.updated_by,
      s.updated_at AS status_updated_at
    FROM bids b
    LEFT JOIN bid_status s ON b.bid_no = s.bid_no AND b.bid_ord = s.bid_ord
    WHERE b.bid_no = ? AND b.bid_ord = ?
  `).bind(bidNo, bidOrd).first()

  return c.json({ success: true, data: updated })
})

// ==================================================================
// REST API: 구글 캘린더 기반 입찰 관리 (gcal_bids + gcal_bid_status)
//   - 기존 bids/bid_status와 완전 별도. 라즈베리파이 CSV를 거치지 않고
//     Cloudflare Worker가 Google Calendar API를 직접 호출해 이벤트를
//     가져온 뒤 파싱하여 gcal_bids 테이블에 저장한다.
// ==================================================================

// [POST] /api/gcal-bids/sync - 구글 캘린더 이벤트를 조회해 gcal_bids에 upsert
// 내부 팀 대시보드의 수동 새로고침 버튼에서 호출한다(기존 상태 변경 API와 동일하게 별도 로그인 없이 개방).
app.post('/api/gcal-bids/sync', async (c) => {
  const { env } = c

  if (!env.GCAL_SERVICE_ACCOUNT_JSON) {
    return c.json({ success: false, error: 'GCAL_SERVICE_ACCOUNT_JSON 시크릿이 설정되지 않았습니다.' }, 500)
  }

  try {
    const result = await syncGcalBids(env)
    return c.json({ success: true, ...result })
  } catch (e: any) {
    return c.json({ success: false, error: String(e?.message || e) }, 500)
  }
})

// [GET] /api/gcal-bids - 목록 조회 (gcal_bids + gcal_bid_status LEFT JOIN)
// 쿼리 파라미터: status, region, industry, q(제목 검색), limit, offset
app.get('/api/gcal-bids', async (c) => {
  const { env } = c
  const status = c.req.query('status')
  const region = c.req.query('region')
  const industry = c.req.query('industry')   // '기계' | '소방' | '전기' (실제 컬럼값의 부분 키워드로 매칭)
  const dateFrom = c.req.query('date_from')  // 'YYYY-MM-DD', 입찰마감일 기준
  const dateTo = c.req.query('date_to')      // 'YYYY-MM-DD', 입찰마감일 기준
  const q = c.req.query('q')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10) || 100, 500)
  const offset = parseInt(c.req.query('offset') ?? '0', 10) || 0

  let query = `
    SELECT
      b.*,
      COALESCE(s.status, '검토중') AS status,
      s.assignee,
      s.memo,
      s.updated_by,
      s.updated_at AS status_updated_at
    FROM gcal_bids b
    LEFT JOIN gcal_bid_status s ON b.event_id = s.event_id
    WHERE 1=1
  `
  const params: any[] = []

  if (status === '검토중' || status === '제출완료') {
    query += ` AND COALESCE(s.status, '검토중') = ?`
    params.push(status)
  }
  if (region) {
    // "충북"/"충청북도"처럼 축약형·정식명칭이 혼재하므로 동의어를 모두 OR로 매칭
    const variants = regionVariants(region)
    query += ` AND (${variants.map(() => `(b.participant_region LIKE ? OR b.joint_region LIKE ?)`).join(' OR ')})`
    for (const v of variants) params.push(`%${v}%`, `%${v}%`)
  }
  if (industry) {
    // 실제 저장값이 "전문소방시설공사업", "기계설비공사업", "전기설비" 등으로 다양하므로
    // 드롭다운의 짧은 키워드(기계/소방/전기)를 그대로 부분일치시킨다.
    query += ` AND b.industry LIKE ?`
    params.push(`%${industry}%`)
  }
  if (dateFrom) {
    query += ` AND substr(b.bid_deadline, 1, 10) >= ?`
    params.push(dateFrom)
  }
  if (dateTo) {
    query += ` AND substr(b.bid_deadline, 1, 10) <= ?`
    params.push(dateTo)
  }
  if (q) {
    query += ` AND b.title LIKE ?`
    params.push(`%${q}%`)
  }

  query += ` ORDER BY b.bid_deadline ASC LIMIT ? OFFSET ?`
  params.push(limit, offset)

  const { results } = await env.DB.prepare(query).bind(...params).all()

  return c.json({ success: true, data: results, count: results.length })
})

// [GET] /api/gcal-bids/:event_id - 단일 조회
app.get('/api/gcal-bids/:event_id', async (c) => {
  const { env } = c
  const eventId = c.req.param('event_id')

  const bid = await env.DB.prepare(`
    SELECT
      b.*,
      COALESCE(s.status, '검토중') AS status,
      s.assignee,
      s.memo,
      s.updated_by,
      s.updated_at AS status_updated_at
    FROM gcal_bids b
    LEFT JOIN gcal_bid_status s ON b.event_id = s.event_id
    WHERE b.event_id = ?
  `).bind(eventId).first()

  if (!bid) {
    return c.json({ success: false, error: 'Bid not found' }, 404)
  }

  return c.json({ success: true, data: bid })
})

// [PUT] /api/gcal-bids/:event_id/status - 상태 변경 (검토중/제출완료, 담당자, 메모)
app.put('/api/gcal-bids/:event_id/status', async (c) => {
  const { env } = c
  const eventId = c.req.param('event_id')
  const body = await c.req.json().catch(() => null)

  const bid = await env.DB.prepare('SELECT 1 FROM gcal_bids WHERE event_id = ?')
    .bind(eventId)
    .first()

  if (!bid) {
    return c.json({ success: false, error: 'Bid not found' }, 404)
  }

  if (body?.status !== undefined && body.status !== '검토중' && body.status !== '제출완료') {
    return c.json({ success: false, error: "status must be '검토중' or '제출완료'" }, 400)
  }

  const existing = await env.DB.prepare('SELECT * FROM gcal_bid_status WHERE event_id = ?')
    .bind(eventId)
    .first()

  const status = body?.status ?? existing?.status ?? '검토중'
  const assignee = body?.assignee !== undefined ? body.assignee : (existing?.assignee ?? null)
  const memo = body?.memo !== undefined ? body.memo : (existing?.memo ?? null)
  const updatedBy = body?.updated_by !== undefined ? body.updated_by : (existing?.updated_by ?? null)

  await env.DB.prepare(`
    INSERT INTO gcal_bid_status (event_id, status, assignee, memo, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(event_id) DO UPDATE SET
      status = excluded.status,
      assignee = excluded.assignee,
      memo = excluded.memo,
      updated_by = excluded.updated_by,
      updated_at = datetime('now')
  `).bind(eventId, status, assignee, memo, updatedBy).run()

  const updated = await env.DB.prepare(`
    SELECT
      b.*,
      COALESCE(s.status, '검토중') AS status,
      s.assignee,
      s.memo,
      s.updated_by,
      s.updated_at AS status_updated_at
    FROM gcal_bids b
    LEFT JOIN gcal_bid_status s ON b.event_id = s.event_id
    WHERE b.event_id = ?
  `).bind(eventId).first()

  return c.json({ success: true, data: updated })
})

// ------------------------------------------------------------------
// 문서/데모 페이지 (프론트엔드)
// ------------------------------------------------------------------
app.use(renderer)

// [메인] 입찰 관리 대시보드
app.get('/', (c) => {
  return c.render(
    <div id="bid-app" class="max-w-6xl mx-auto py-8 px-4">
      <header class="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-2xl md:text-3xl font-bold text-gray-800">
            <i class="fas fa-gavel mr-2 text-blue-600"></i>
            입찰 관리 대시보드
          </h1>
          <p class="text-gray-500 mt-1 text-sm">
            나라장터 입찰공고 현황 + 우리 팀의 진행상태(검토중/제출완료)를 함께 관리합니다.
          </p>
        </div>
        <div class="flex items-center gap-4">
          <a href="/gcal" class="text-sm text-purple-600 hover:underline">
            <i class="fas fa-calendar-alt mr-1"></i>구글 캘린더 기준 대시보드 보기
          </a>
        </div>
      </header>

      <section id="filter-bar" class="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label class="block text-xs text-gray-500 mb-1">상태</label>
          <select id="filter-status" class="border rounded px-2 py-1.5 text-sm">
            <option value="">전체</option>
            <option value="검토중">검토중</option>
            <option value="제출완료">제출완료</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">지역</label>
          <select id="filter-region" class="border rounded px-2 py-1.5 text-sm">
            <option value="">전체</option>
            <option value="전국">전국</option>
            <option value="충북">충북</option>
            <option value="세종">세종</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">공종</label>
          <select id="filter-industry" class="border rounded px-2 py-1.5 text-sm">
            <option value="">전체</option>
            <option value="기계">기계</option>
            <option value="소방">소방</option>
            <option value="전기">전기</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">기간(마감일 기준)</label>
          <div class="flex items-center gap-1">
            <input id="filter-date-from" type="date" class="border rounded px-2 py-1.5 text-sm" />
            <span class="text-gray-400">~</span>
            <input id="filter-date-to" type="date" class="border rounded px-2 py-1.5 text-sm" />
          </div>
        </div>
        <div class="flex-1 min-w-[160px]">
          <label class="block text-xs text-gray-500 mb-1">공고명 검색</label>
          <input id="filter-q" type="text" placeholder="공고명 키워드" class="border rounded px-2 py-1.5 text-sm w-full" />
        </div>
        <button id="filter-apply-btn" class="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">
          <i class="fas fa-search mr-1"></i>조회
        </button>
        <button id="filter-reset-btn" class="bg-gray-200 text-gray-700 px-4 py-1.5 rounded text-sm hover:bg-gray-300">
          초기화
        </button>
        <span id="result-count" class="text-sm text-gray-400 ml-auto"></span>
      </section>

      <section class="bg-white rounded-lg shadow overflow-x-auto">
        <table class="w-full text-sm min-w-[1355px] table-fixed">
          <colgroup>
            <col class="w-[70px]" />
            <col class="w-[300px]" />
            <col class="w-[110px]" />
            <col class="w-[160px]" />
            <col class="w-[60px]" />
            <col class="w-[115px]" />
            <col class="w-[150px]" />
            <col class="w-[150px]" />
            <col class="w-[70px]" />
            <col class="w-[120px]" />
            <col class="w-[50px]" />
          </colgroup>
          <thead class="bg-gray-50 text-gray-600">
            <tr class="text-left border-b">
              <th class="py-2 px-3">상태</th>
              <th class="py-2 px-3">공고명</th>
              <th class="py-2 px-3">발주기관</th>
              <th class="py-2 px-3">지역</th>
              <th class="py-2 px-3">공종</th>
              <th class="py-2 px-3">추정가격</th>
              <th class="py-2 px-3">입찰개시일</th>
              <th class="py-2 px-3">입찰마감</th>
              <th class="py-2 px-3">담당자</th>
              <th class="py-2 px-3">메모</th>
              <th class="py-2 px-3">링크</th>
            </tr>
          </thead>
          <tbody id="bid-list-body" class="divide-y">
            <tr><td colspan={11} class="py-8 text-center text-gray-400">불러오는 중...</td></tr>
          </tbody>
        </table>
      </section>

      {/* 상태/담당자/메모 수정 모달 */}
      <div id="edit-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
          <h3 class="text-lg font-semibold mb-4">진행상태 수정</h3>
          <input type="hidden" id="edit-bid-no" />
          <input type="hidden" id="edit-bid-ord" />
          <p id="edit-bid-title" class="text-sm text-gray-600 mb-4 line-clamp-2"></p>

          <div class="mb-3">
            <label class="block text-xs text-gray-500 mb-1">상태</label>
            <select id="edit-status" class="border rounded px-3 py-2 w-full text-sm">
              <option value="검토중">검토중</option>
              <option value="제출완료">제출완료</option>
            </select>
          </div>
          <div class="mb-3">
            <label class="block text-xs text-gray-500 mb-1">담당자</label>
            <input id="edit-assignee" type="text" placeholder="담당자 이름" class="border rounded px-3 py-2 w-full text-sm" />
          </div>
          <div class="mb-4">
            <label class="block text-xs text-gray-500 mb-1">메모</label>
            <textarea id="edit-memo" rows={3} placeholder="특이사항 메모" class="border rounded px-3 py-2 w-full text-sm"></textarea>
          </div>

          <div class="flex justify-end gap-2">
            <button id="edit-cancel-btn" class="px-4 py-2 rounded text-sm bg-gray-200 hover:bg-gray-300">취소</button>
            <button id="edit-save-btn" class="px-4 py-2 rounded text-sm bg-blue-600 text-white hover:bg-blue-700">저장</button>
          </div>
        </div>
      </div>
    </div>
  )
})

// [구글 캘린더 기준] 별도 입찰 관리 대시보드
app.get('/gcal', (c) => {
  return c.render(
    <div id="gcal-bid-app" class="max-w-6xl mx-auto py-8 px-4">
      <header class="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-2xl md:text-3xl font-bold text-gray-800">
            <i class="fas fa-calendar-alt mr-2 text-purple-600"></i>
            구글 캘린더 입찰 대시보드
          </h1>
          <p class="text-gray-500 mt-1 text-sm">
            구글 캘린더(ck-bid 서비스 계정)에 등록된 입찰개시 이벤트를 직접 가져와 진행상태(검토중/제출완료)를 관리합니다.
          </p>
        </div>
        <a href="/" class="text-sm text-blue-600 hover:underline">
          <i class="fas fa-database mr-1"></i>라즈베리파이 기준 대시보드로 돌아가기
        </a>
      </header>

      <section id="gcal-filter-bar" class="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label class="block text-xs text-gray-500 mb-1">상태</label>
          <select id="gcal-filter-status" class="border rounded px-2 py-1.5 text-sm">
            <option value="">전체</option>
            <option value="검토중">검토중</option>
            <option value="제출완료">제출완료</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">지역</label>
          <select id="gcal-filter-region" class="border rounded px-2 py-1.5 text-sm">
            <option value="">전체</option>
            <option value="전국">전국</option>
            <option value="충북">충북</option>
            <option value="세종">세종</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">공종</label>
          <select id="gcal-filter-industry" class="border rounded px-2 py-1.5 text-sm">
            <option value="">전체</option>
            <option value="기계">기계</option>
            <option value="소방">소방</option>
            <option value="전기">전기</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">기간(마감일 기준)</label>
          <div class="flex items-center gap-1">
            <input id="gcal-filter-date-from" type="date" class="border rounded px-2 py-1.5 text-sm" />
            <span class="text-gray-400">~</span>
            <input id="gcal-filter-date-to" type="date" class="border rounded px-2 py-1.5 text-sm" />
          </div>
        </div>
        <div class="flex-1 min-w-[160px]">
          <label class="block text-xs text-gray-500 mb-1">공고명 검색</label>
          <input id="gcal-filter-q" type="text" placeholder="공고명 키워드" class="border rounded px-2 py-1.5 text-sm w-full" />
        </div>
        <button id="gcal-filter-apply-btn" class="bg-purple-600 text-white px-4 py-1.5 rounded text-sm hover:bg-purple-700">
          <i class="fas fa-search mr-1"></i>조회
        </button>
        <button id="gcal-filter-reset-btn" class="bg-gray-200 text-gray-700 px-4 py-1.5 rounded text-sm hover:bg-gray-300">
          초기화
        </button>
        <button id="gcal-sync-btn" class="bg-purple-100 text-purple-700 px-4 py-1.5 rounded text-sm hover:bg-purple-200">
          <i class="fas fa-sync mr-1"></i>캘린더 동기화
        </button>
        <span id="gcal-result-count" class="text-sm text-gray-400 ml-auto"></span>
      </section>

      <section class="bg-white rounded-lg shadow overflow-x-auto">
        <table class="w-full text-sm min-w-[1355px] table-fixed">
          <colgroup>
            <col class="w-[70px]" />
            <col class="w-[300px]" />
            <col class="w-[110px]" />
            <col class="w-[160px]" />
            <col class="w-[60px]" />
            <col class="w-[115px]" />
            <col class="w-[150px]" />
            <col class="w-[150px]" />
            <col class="w-[70px]" />
            <col class="w-[120px]" />
            <col class="w-[50px]" />
          </colgroup>
          <thead class="bg-gray-50 text-gray-600">
            <tr class="text-left border-b">
              <th class="py-2 px-3">상태</th>
              <th class="py-2 px-3">공고명</th>
              <th class="py-2 px-3">발주기관</th>
              <th class="py-2 px-3">참가지역</th>
              <th class="py-2 px-3">공종</th>
              <th class="py-2 px-3">기초금액</th>
              <th class="py-2 px-3">입찰개시일</th>
              <th class="py-2 px-3">입찰마감</th>
              <th class="py-2 px-3">담당자</th>
              <th class="py-2 px-3">메모</th>
              <th class="py-2 px-3">링크</th>
            </tr>
          </thead>
          <tbody id="gcal-bid-list-body" class="divide-y">
            <tr><td colspan={11} class="py-8 text-center text-gray-400">불러오는 중...</td></tr>
          </tbody>
        </table>
      </section>

      {/* 상태/담당자/메모 수정 모달 */}
      <div id="gcal-edit-modal" class="fixed inset-0 bg-black/40 hidden items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
          <h3 class="text-lg font-semibold mb-4">진행상태 수정</h3>
          <input type="hidden" id="gcal-edit-event-id" />
          <p id="gcal-edit-bid-title" class="text-sm text-gray-600 mb-4 line-clamp-2"></p>

          <div class="mb-3">
            <label class="block text-xs text-gray-500 mb-1">상태</label>
            <select id="gcal-edit-status" class="border rounded px-3 py-2 w-full text-sm">
              <option value="검토중">검토중</option>
              <option value="제출완료">제출완료</option>
            </select>
          </div>
          <div class="mb-3">
            <label class="block text-xs text-gray-500 mb-1">담당자</label>
            <input id="gcal-edit-assignee" type="text" placeholder="담당자 이름" class="border rounded px-3 py-2 w-full text-sm" />
          </div>
          <div class="mb-4">
            <label class="block text-xs text-gray-500 mb-1">메모</label>
            <textarea id="gcal-edit-memo" rows={3} placeholder="특이사항 메모" class="border rounded px-3 py-2 w-full text-sm"></textarea>
          </div>

          <div class="flex justify-end gap-2">
            <button id="gcal-edit-cancel-btn" class="px-4 py-2 rounded text-sm bg-gray-200 hover:bg-gray-300">취소</button>
            <button id="gcal-edit-save-btn" class="px-4 py-2 rounded text-sm bg-purple-600 text-white hover:bg-purple-700">저장</button>
          </div>
        </div>
      </div>
    </div>
  )
})

// [GET] /manual - 비개발자용 사용 매뉴얼(MANUAL.md)을 웹페이지로 열람
//   - 로그인 없이 URL만으로 누구나 열람 가능(전체 공개 라우트)
//   - Cloudflare Workers는 런타임에 파일을 읽을 수 없으므로, 브라우저에서
//     정적 파일(/static/manual.md)을 fetch한 뒤 marked.js(CDN)로 렌더링한다.
app.get('/manual', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>입찰관리 대시보드 - 사용 매뉴얼</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
      <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
      <style>
        #manual-content h1 { font-size: 1.8rem; font-weight: 700; margin: 1.2em 0 0.6em; color: #1f2937; }
        #manual-content h2 { font-size: 1.4rem; font-weight: 700; margin: 1.4em 0 0.5em; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.3em; }
        #manual-content h3 { font-size: 1.15rem; font-weight: 600; margin: 1.1em 0 0.4em; color: #374151; }
        #manual-content p { margin: 0.6em 0; line-height: 1.7; color: #374151; }
        #manual-content ul, #manual-content ol { margin: 0.6em 0; padding-left: 1.5em; line-height: 1.7; color: #374151; }
        #manual-content li { margin: 0.3em 0; }
        #manual-content code { background: #f3f4f6; padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em; }
        #manual-content pre { background: #1f2937; color: #f3f4f6; padding: 1em; border-radius: 8px; overflow-x: auto; margin: 0.8em 0; }
        #manual-content pre code { background: none; padding: 0; color: inherit; }
        #manual-content table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
        #manual-content th, #manual-content td { border: 1px solid #e5e7eb; padding: 0.5em 0.8em; text-align: left; }
        #manual-content th { background: #f9fafb; font-weight: 600; }
        #manual-content a { color: #2563eb; text-decoration: underline; }
        #manual-content hr { margin: 1.5em 0; border-color: #e5e7eb; }
        #manual-content blockquote { border-left: 4px solid #d1d5db; padding-left: 1em; color: #6b7280; margin: 0.8em 0; }
      </style>
    </head>
    <body class="bg-gray-50">
      <div class="max-w-3xl mx-auto py-8 px-4">
        <div class="mb-4 flex items-center justify-between">
          <a href="/gcal" class="text-sm text-blue-600 hover:underline">
            <i class="fas fa-arrow-left mr-1"></i>대시보드로 돌아가기
          </a>
        </div>
        <div class="bg-white rounded-lg shadow p-6 md:p-10">
          <div id="manual-content" class="text-sm md:text-base">
            <p class="text-gray-400">불러오는 중...</p>
          </div>
        </div>
      </div>
      <script>
        fetch('/static/manual.md')
          .then((r) => {
            if (!r.ok) throw new Error('failed to load manual.md: ' + r.status)
            return r.text()
          })
          .then((text) => {
            document.getElementById('manual-content').innerHTML = marked.parse(text)
          })
          .catch((err) => {
            document.getElementById('manual-content').innerHTML =
              '<p class="text-red-500">매뉴얼을 불러오지 못했습니다: ' + err.message + '</p>'
          })
      </script>
    </body>
    </html>
  `)
})

export default app
