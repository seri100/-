// ==================================================================
// 구글 캘린더(Google Calendar API) 직접 연동 모듈
//   - Cloudflare Workers 런타임에서는 Node.js용 googleapis 패키지를
//     사용할 수 없으므로, Web Crypto API로 서비스 계정 JWT를 직접
//     서명해 OAuth2 access token을 발급받고 REST API를 fetch로 호출한다.
//   - 이벤트 title/description은 라즈베리파이 main_send.py의
//     build_gcal_message() 가 만든 "라벨 : 값" 줄바꿈 포맷을 그대로
//     따르므로, 같은 라벨 기준으로 정규식 파싱한다.
// ==================================================================

export type GcalBindings = {
  DB: D1Database
  // 서비스 계정 키(JSON 전체를 문자열로) - wrangler secret으로 등록, 절대 코드에 하드코딩 금지
  GCAL_SERVICE_ACCOUNT_JSON: string
  // 이벤트를 읽어올 캘린더 ID (기본값: 라즈베리파이가 실제로 쓰는 캘린더)
  GCAL_CALENDAR_ID?: string
}

const DEFAULT_CALENDAR_ID = 'ck4642060@gmail.com'
const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

interface ServiceAccountKey {
  client_email: string
  private_key: string
  token_uri?: string
}

// ------------------------------------------------------------------
// base64url 인코딩 유틸 (Web Crypto API 결과물을 JWT 세그먼트로 변환)
// ------------------------------------------------------------------
function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlFromString(str: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(str))
}

// PEM(PKCS8) 형식의 private_key 문자열을 crypto.subtle.importKey용 ArrayBuffer로 변환
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const keyData = pemToArrayBuffer(pem)
  return crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

// ------------------------------------------------------------------
// 서비스 계정 JWT 서명 -> Google OAuth2 access token 교환
// ------------------------------------------------------------------
let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(env: GcalBindings): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  if (cachedToken && cachedToken.expiresAt - 60 > now) {
    return cachedToken.token
  }

  if (!env.GCAL_SERVICE_ACCOUNT_JSON) {
    throw new Error('GCAL_SERVICE_ACCOUNT_JSON 시크릿이 설정되지 않았습니다.')
  }

  let key: ServiceAccountKey
  try {
    key = JSON.parse(env.GCAL_SERVICE_ACCOUNT_JSON)
  } catch (e) {
    throw new Error('GCAL_SERVICE_ACCOUNT_JSON 파싱 실패: 유효한 JSON이 아닙니다.')
  }

  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: key.client_email,
    scope: GCAL_SCOPE,
    aud: key.token_uri || TOKEN_URL,
    iat: now,
    exp: now + 3600
  }

  const signingInput = `${base64UrlFromString(JSON.stringify(header))}.${base64UrlFromString(JSON.stringify(claim))}`

  const cryptoKey = await importPrivateKey(key.private_key)
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  const jwt = `${signingInput}.${base64UrlFromBytes(new Uint8Array(signature))}`

  const res = await fetch(key.token_uri || TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Google OAuth2 토큰 발급 실패 (${res.status}): ${text}`)
  }

  const data = await res.json<{ access_token: string; expires_in: number }>()
  cachedToken = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) }
  return data.access_token
}

// ------------------------------------------------------------------
// Google Calendar events.list 호출
// ------------------------------------------------------------------
interface GcalEventItem {
  id: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  status?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}

async function listCalendarEvents(env: GcalBindings): Promise<GcalEventItem[]> {
  const accessToken = await getAccessToken(env)
  const calendarId = env.GCAL_CALENDAR_ID || DEFAULT_CALENDAR_ID

  const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // 30일 전
  const timeMax = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString() // 180일 후

  const items: GcalEventItem[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250'
    })
    if (pageToken) params.set('pageToken', pageToken)

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Google Calendar API 호출 실패 (${res.status}): ${text}`)
    }

    const data = await res.json<{ items: GcalEventItem[]; nextPageToken?: string }>()
    items.push(...(data.items || []))
    pageToken = data.nextPageToken
  } while (pageToken)

  return items.filter((it) => it.status !== 'cancelled')
}

// ------------------------------------------------------------------
// description 파싱: "라벨 : 값" 줄바꿈 포맷 (main_send.py build_gcal_message 형식)
//   - 주의: Google Calendar API는 description을 HTML로 반환하므로
//     실제 줄바꿈 문자(\n)가 아니라 <br> 태그로 되어 있다.
//     또한 참가업체 목록은 <table>...</table>, 상세URL은 <a href="...">로
//     감싸져 있어 파싱 전에 정규화가 필요하다.
// ------------------------------------------------------------------

// HTML을 라즈베리파이 원본 텍스트(줄바꿈 기반)에 최대한 가깝게 되돌린다.
function normalizeGcalDescription(html: string): string {
  if (!html) return ''
  let text = html
    // <br>, <br/>, <br /> 전부 개행으로
    .replace(/<br\s*\/?>/gi, '\n')
    // <table>...</table> 블록(참가업체 리스트)은 통째로 제거 - 라벨 파싱에 방해되지 않도록
    .replace(/<table[\s\S]*?<\/table>/gi, '')
    // <div>, <p> 도 개행으로 취급
    .replace(/<\/(div|p)>/gi, '\n')
    // 나머지 태그 제거 (단, <a href="...">텍스트</a> 는 URL을 살려서 치환)
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    // HTML 엔티티 복원
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // 개행 3개 이상은 2개로 축소
    .replace(/\n{3,}/g, '\n\n')

  return text
}

function extractField(text: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // 콜론과 값 사이는 "줄바꿈이 아닌 공백"만 허용한다.
  //   - \s*를 쓰면 값이 비어있을 때 줄바꿈까지 삼켜 다음 줄
  //     ("입찰서접수개시일시 : ...")을 잘못 캡처하는 버그가 있었다.
  //   - 그렇다고 [ \t]*로 좁히면, 원본에 일반 스페이스가 아닌 NBSP(\u00a0)가
  //     라벨-콜론 사이에 들어간 경우("기초금액\u00a0\u00a0: ...")를 놓쳐
  //     정상 값까지 NULL로 만드는 회귀가 생긴다.
  //   - [^\S\r\n]* : "공백 문자이면서 \r, \n은 아닌 것" = NBSP 등 모든
  //     공백류는 허용하되 줄바꿈만 제외한다.
  const re = new RegExp(`^${escaped}[^\\S\\r\\n]*[:：][^\\S\\r\\n]*(.*)$`, 'm')
  const m = text.match(re)
  if (!m) return null
  const v = m[1].trim()
  return v ? v : null
}

// ------------------------------------------------------------------
// 업종/참가지역 폴백 파서
//   - 라즈베리파이가 보내는 캘린더 설명은 "발주기관 : ..." 라벨형 포맷과
//     자유 텍스트형 포맷(예: "[충청북도 청주시]\n날짜...")이 섞여 있어,
//     표준 라벨(업종/참가지역)이 없으면 절반 가까운 이벤트가 값 없이
//     저장되어 지역/공종 필터에서 누락되는 문제가 있었다.
//   - 아래 폴백은 본문 전체에서 공종/지역 키워드를 직접 탐색해 채운다.
// ------------------------------------------------------------------

// 긴 지역명을 먼저 검사해야 "충청북도"가 "충북"보다 먼저 매칭된다.
const REGION_KEYWORDS = [
  '충청북도', '충청남도', '전라북도', '전라남도', '경상북도', '경상남도',
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시',
  '대전광역시', '울산광역시', '세종특별자치시',
  '충북', '충남', '전북', '전남', '경북', '경남',
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '제주', '전국'
]

// 공동도급지역 표시용 축약형 매핑 ("세종특별자치시" -> "세종")
//   - index.tsx REGION_SYNONYMS와 동일한 축약형 집합을 사용해 "전국/세종49%"처럼
//     짧게 표시한다. 이미 축약형인 값("경기", "충남" 등)은 그대로 둔다.
const REGION_ABBREVIATIONS: Record<string, string> = {
  '충청북도': '충북', '충청남도': '충남', '전라북도': '전북', '전라남도': '전남',
  '경상북도': '경북', '경상남도': '경남', '서울특별시': '서울', '부산광역시': '부산',
  '대구광역시': '대구', '인천광역시': '인천', '광주광역시': '광주', '대전광역시': '대전',
  '울산광역시': '울산', '세종특별자치시': '세종', '경기도': '경기',
  '강원도': '강원', '강원특별자치도': '강원', '제주도': '제주', '제주특별자치도': '제주'
}

function abbreviateRegion(name: string): string {
  return REGION_ABBREVIATIONS[name] || name
}

// "경기,49%" / "세종특별자치시" / "없음" 등 다양한 표기의 공동도급지역 원본값에서
// "지역명(축약형)" + "비율"을 뽑아 "전국/세종49%" 표시용 접미사(예: "/세종49%")로 조립한다.
//   - 지역명과 비율이 콤마로 한 줄에 오는 경우("경기,49%")와, 지역명만 있고
//     비율은 "공동도급비율" 라벨에 별도로 오는 경우(합강중학교 건)를 모두 처리한다.
//   - "없음"이거나 지역 키워드를 전혀 못 찾으면 접미사 없이 null을 반환한다.
function buildJointRegionSuffix(jointRegion: string | null, jointRatio: string | null): string | null {
  if (!jointRegion) return null
  const trimmed = jointRegion.trim()
  if (!trimmed || trimmed === '없음') return null

  const commaIdx = trimmed.indexOf(',')
  const namePart = (commaIdx >= 0 ? trimmed.slice(0, commaIdx) : trimmed).trim()
  const inlineRatio = commaIdx >= 0 ? trimmed.slice(commaIdx + 1).trim() : ''
  const ratio = inlineRatio || (jointRatio && jointRatio.trim() !== '없음' ? jointRatio.trim() : '')

  const matchedKeyword = REGION_KEYWORDS.find((kw) => kw !== '전국' && namePart.includes(kw))
  if (!matchedKeyword) return null

  return `/${abbreviateRegion(matchedKeyword)}${ratio}`
}

function extractRegionFallback(text: string): string | null {
  if (!text) return null
  // "공동도급지역 : 세종특별자치시" 같은 줄은 참가지역(입찰 참가자격 지역제한)이 아니라
  // 공동수급체 구성 조건에 관한 별개 항목이므로, 지역 키워드 탐색 대상에서 반드시 제외한다.
  //   - 이 줄을 포함해 스캔하면 "참가지역" 라벨이 아예 없는 이벤트에서 공동도급지역
  //     문구 속 지역명을 참가지역으로 잘못 채우는 버그가 있었다. (예: 합강중학교 건 -
  //     참가지역 라벨 없음 + "공동도급지역 : 세종특별자치시"만 있는데 지역이 "세종"으로 오표시됨)
  const scanText = text.replace(/^공동도급지역[^\S\r\n]*[:：].*$/gm, '')
  // "[충청북도 청주시]" 같은 대괄호 지역 표기를 우선 그대로 살린다.
  const bracket = scanText.match(/\[([^\]]+)\]/)
  if (bracket && REGION_KEYWORDS.some((kw) => bracket[1].includes(kw))) {
    return bracket[1].trim()
  }
  for (const kw of REGION_KEYWORDS) {
    if (scanText.includes(kw)) return kw
  }
  return null
}

// "3,222,681,000원 (이백육십칠억팔천오십이만원)" 같은 금액 문자열에서 앞쪽 숫자를 정수로 파싱한다.
// (public/static/gcal-app.js의 formatAmountThousand()와 동일한 패턴)
function parseAmountValue(v: string | null): number | null {
  if (!v) return null
  const m = v.match(/[\d,]+/)
  if (!m) return null
  const digits = m[0].replace(/,/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  return Number.isNaN(n) ? null : n
}

// 공종 표준 명칭(실제 나라장터/한전 등에서 쓰이는 업종명)으로 통일해 반환한다.
function extractIndustryFallback(text: string, title: string | null): string | null {
  const combined = `${title || ''}\n${text || ''}`
  if (!combined.trim()) return null
  if (combined.includes('소방')) return '전문소방시설공사업'
  // "기계"라는 글자가 직접 없어도 실제로는 기계설비공사업으로 분류되는
  // 특정 시설명이 있다(LH 상세페이지 "요구면허" 표 기준으로 확인됨).
  //   - "자동크린넷": 아파트 단지 쓰레기 자동이송설비 -> 기계설비·가스공사업
  //     (예: "충남도청(내포)신도시 RH-12BL 단지내 자동크린넷 시설공사"는
  //      LH 캘린더의 "업종유형" 라벨이 "전문공사"로만 표시되어 있으나,
  //      LH 자체 상세페이지의 "요구면허" 표에는 "기계설비·가스공사업"이라고
  //      명시되어 있다. 캘린더 description에는 이 요구면허 정보가 없으므로
  //      제목의 "크린넷" 키워드로 유추한다.)
  //   - "열량계"(적산열량계/열계량기): 지역난방 냉·난방 배관에 설치하는 계량 설비로,
  //     기계설비공사업 업무영역에 속한다(관련 전문건설업체 실적 자료로 확인됨).
  //     예: "2026년 적산열량계 설치 및 교체공사" - LH 업종유형이 "전문공사"로만
  //     표시되어 다른 기계설비 키워드가 전혀 없는 케이스라 별도로 추가한다.
  if (combined.includes('기계') || combined.includes('크린넷') || combined.includes('열량계')) return '기계설비공사업'
  if (combined.includes('전기')) return '전기공사업'
  return null
}

// LH의 "업종유형" 라벨은 종종 "전문공사"/"종합공사"(+"(상대업종 불허)" 등 부가문구)처럼
// 구체적 공종(기계/전기/소방)을 전혀 알 수 없는 대분류값만 제공한다.
//   - 예: "충남도청(내포)신도시 RH-12BL 단지내 자동크린넷 시설공사"는 업종유형이
//     "전문공사"로만 표시되지만, LH 상세페이지의 "요구면허" 표에는 "기계설비·가스공사업"
//     이라고 명시되어 있다(캘린더 description에는 이 요구면허 정보 자체가 없음).
//   - 이런 뭉뚱그린 값을 그대로 저장하면 화면의 공종 필터(기계/소방/전기)와 매칭되지
//     않아 필터에서 실종된다. 아래 정규식에 해당하면 "값이 없는 것"으로 간주해
//     제목/본문 키워드 유추(extractIndustryFallback)로 재시도한다.
const GENERIC_INDUSTRY_RE = /^(전문공사|종합공사)(\s*\([^)]*\))?$/
function isGenericIndustryLabel(v: string | null): boolean {
  if (!v) return false
  return GENERIC_INDUSTRY_RE.test(v.trim())
}

export interface ParsedGcalBid {
  event_id: string
  bid_no: string | null
  bid_ord: string | null
  title: string | null
  summary: string | null
  agency: string | null
  industry: string | null
  task_type: string | null
  bid_method: string | null
  base_amount: string | null
  pure_cost: string | null
  a_value: string | null
  lower_rate: string | null
  participant_region: string | null
  joint_region: string | null
  bid_open_recv_date: string | null
  bid_deadline: string | null
  agreement_deadline: string | null
  detail_url: string | null
  location: string | null
  event_start: string | null
  event_end: string | null
  html_link: string | null
  raw_description: string | null
}

// 상세URL의 쿼리파라미터(bidPbancNo/bidPbancOrd)에서 공고번호를 복원하는 폴백
function extractBidNoFromUrl(url: string | null): { bidNo: string | null; bidOrd: string | null } {
  if (!url) return { bidNo: null, bidOrd: null }
  try {
    const u = new URL(url)
    const no = u.searchParams.get('bidPbancNo')
    const ord = u.searchParams.get('bidPbancOrd')
    return { bidNo: no, bidOrd: ord ? ord.padStart(3, '0') : null }
  } catch {
    return { bidNo: null, bidOrd: null }
  }
}

// 날짜 문자열의 구분자를 "YYYY-MM-DD"로 통일한다.
//   - 나라장터/한전 등 대부분의 소스는 "2026-08-20 10:00:00" 형태를 쓰지만,
//     일부 수동 등록 이벤트는 "2026/08/28 10:00:00"처럼 슬래시를 쓴다.
//   - 날짜 필터(/api/gcal-bids?date_from=...)가 substr()로 앞 10자리를 문자열
//     비교하는데, ASCII상 '/'(47)가 '-'(45)보다 커서 슬래시 포맷 날짜가 실제로는
//     기간 안에 있어도 문자열 비교에서 밀려나 검색 결과에서 누락되는 버그가 있었다.
//     저장 시점에 구분자를 통일해 이 문제를 근본적으로 막는다.
function normalizeDateSeparator(v: string | null): string | null {
  if (!v) return v
  // "YYYY/MM/DD" 부분만 "YYYY-MM-DD"로 치환 (시각 부분의 콜론 등은 건드리지 않음)
  return v.replace(/(\d{4})\/(\d{2})\/(\d{2})/g, '$1-$2-$3')
}

// 라벨(입찰서접수개시일시/입찰마감일시) 없이 "YYYY-MM-DD HH:MM[:SS] ~ YYYY-MM-DD HH:MM[:SS]"
// 형태의 날짜범위 줄만 있는 구버전 캘린더 이벤트를 위한 폴백 파서.
//   - 날짜 구분자는 '-' 뿐 아니라 '/'도 흔히 쓰이므로([-/] 둘 다 허용) 매칭한다.
//     (예: "운호중 급식시설 현대화사업 기계/소방공사" - "2026/08/13 11:00:00 ~ 2026/08/24 10:00:00"
//     처럼 슬래시만 쓰는 이벤트가 있는데, 하이픈만 인식하던 구버전 정규식은 이를 완전히
//     놓쳐 bid_deadline이 NULL로 저장되고 기간 검색에서 통째로 누락되는 버그가 있었다.)
//   - 시:분 사이에 공백이 낀 오타("15 :00")도 방어적으로 허용한다.
function extractDateRangeFallback(text: string): { start: string | null; end: string | null } {
  const re = /(\d{4}[-/]\d{2}[-/]\d{2}\s+\d{2}\s*:\s*\d{2}(?::\d{2})?)\s*~\s*[\s\u00a0]*(\d{4}[-/]\d{2}[-/]\d{2}\s+\d{2}\s*:\s*\d{2}(?::\d{2})?)/
  const m = text.match(re)
  if (!m) return { start: null, end: null }
  return { start: m[1].trim().replace(/\s*:\s*/g, ':'), end: m[2].trim().replace(/\s*:\s*/g, ':') }
}

// description(정규화된 텍스트)과 summary만으로 파싱 가능한 필드들.
// item(캘린더 API 원본 이벤트)에 의존하는 나머지 필드(event_id/location/
// event_start/event_end/html_link/raw_description)는 parseGcalEvent에서 덧붙인다.
//   - 이렇게 분리해두면 DB에 이미 저장된 raw_description을 다시 넣어 재파싱하는
//     reparseStoredGcalBids()에서도 동일한 파싱 로직(라벨 추출/폴백 등)을 그대로
//     재사용할 수 있다. 그래야 "구글 캘린더 조회 범위(최근 -30일~+180일) 밖으로
//     밀려난 오래된 이벤트"도 파싱 로직 개선의 혜택을 받을 수 있다.
//     (예: "2026년 적산열량계 설치 및 교체공사" - 입찰서접수마감일시가 2026/07/23로
//      이미 과거라 캘린더 API 재조회 대상에서 빠지므로, syncGcalBids()만으로는
//      "열량계" 키워드 추가 같은 파싱 로직 개선이 반영되지 않는 문제가 있었다.)
type ParsedGcalFields = Omit<
  ParsedGcalBid,
  'event_id' | 'location' | 'event_start' | 'event_end' | 'html_link' | 'raw_description' | 'summary'
>

function parseGcalDescription(description: string, summaryRaw: string | null): ParsedGcalFields {
  const detailUrl = extractField(description, '상세URL')

  const noticeRaw = extractField(description, '공고번호')
  let bidNo: string | null = null
  let bidOrd: string | null = null
  if (noticeRaw) {
    const m = noticeRaw.match(/([A-Z0-9]+)\s*-\s*(\d+)/)
    if (m) {
      bidNo = m[1]
      bidOrd = m[2].padStart(3, '0')
    } else {
      bidNo = noticeRaw
    }
  }
  // 공고번호 라벨이 없는 구버전 이벤트는 상세URL 쿼리파라미터에서 복원
  if (!bidNo) {
    const fromUrl = extractBidNoFromUrl(detailUrl)
    bidNo = fromUrl.bidNo
    bidOrd = fromUrl.bidOrd
  }

  // 제목: "공고명" 라벨이 기본이나, LH(한국토지주택공사) 공고는 "입찰공고건명"
  // 이라는 별도 라벨을 쓴다. 둘 다 없으면 캘린더 이벤트 제목(summary)에서
  // "[입찰개시]" 접두어만 제거해 최후 폴백으로 사용한다.
  //   - 이 폴백이 없으면 LH 공고는 summary 원문(예: "<LH>[입찰개시]ㅇ?충남도청...-10")이
  //     그대로 title에 남아 "<LH>", "ㅇ?", "-10" 같은 잡음이 섞인 제목으로 저장되고,
  //     실제 공고명으로 검색해도 찾을 수 없는 문제가 있었다.
  const title =
    extractField(description, '공고명') ||
    extractField(description, '입찰공고건명') ||
    (summaryRaw ? summaryRaw.replace(/^[^\[]*\[입찰개시\]\s*/, '') : null)

  // 입찰서접수개시일시/입찰마감일시 라벨이 있으면 그대로, 없으면
  // "시작 ~ 끝" 형태의 날짜범위 줄에서 폴백으로 채운다.
  //   - LH 공고는 "입찰마감일시" 대신 "입찰서접수마감일시"라는 라벨을 쓴다.
  //     이 폴백이 없으면 bid_deadline이 NULL로 저장되어, 화면의 "기간(마감일 기준)"
  //     필터를 하나라도 지정하면 해당 공고가 검색 결과에서 완전히 누락되는 문제가 있었다.
  let bidOpenRecvDate = extractField(description, '입찰서접수개시일시')
  let bidDeadline = extractField(description, '입찰마감일시') || extractField(description, '입찰서접수마감일시')
  if (!bidOpenRecvDate || !bidDeadline) {
    const range = extractDateRangeFallback(description)
    if (!bidOpenRecvDate) bidOpenRecvDate = range.start
    if (!bidDeadline) bidDeadline = range.end
  }

  // 업종: "업종" 라벨 -> LH식 "업종유형" 라벨(단, "전문공사"/"종합공사"처럼 세부 공종을
  //       알 수 없는 대분류값이면 건너뛴다) -> 한전식 "면허·첨부서류"(업종코드 포함) ->
  //       그래도 없으면 제목/본문 키워드(소방/기계/전기)로 유추
  const industryTypeLabel = extractField(description, '업종유형')
  const industry =
    extractField(description, '업종') ||
    (isGenericIndustryLabel(industryTypeLabel) ? null : industryTypeLabel) ||
    extractIndustryFallback(extractField(description, '면허·첨부서류') || '', null) ||
    extractIndustryFallback(description, title) ||
    industryTypeLabel

  // "기초금액" 라벨이 기본이나, 일부 수동 등록 이벤트는 "추정금액"으로 표기하므로 폴백 처리
  const baseAmount = extractField(description, '기초금액') || extractField(description, '추정금액')
  const jointRegion = extractField(description, '공동도급지역')
  const jointRatio = extractField(description, '공동도급비율')

  // 참가지역: "참가지역" 라벨 -> 국가철도공단식 "지역" 라벨 -> 본문 전체에서 지역명 직접 탐색
  //          -> 그래도 없으면 지역 제한이 없다는 뜻이므로 "전국"으로 기본 표시한다.
  //   - NULL로 남기면 지역필터="전국" 선택 시 `participant_region LIKE '%전국%'`라는
  //     리터럴 문자열 검색이라 걸리지 않으므로(REGION_SYNONYMS에 '전국' 키가 없음),
  //     반드시 문자열 "전국"으로 채워야 필터와 호환된다.
  //   - 업무 규칙(실사용자 확인): 공동도급지역이 실질적으로 존재("없음" 제외)하거나
  //     기초금액(추정가격)이 11억원 이상이면, "참가지역" 라벨에 특정 지역명이 적혀
  //     있더라도 실제로는 전국 단위 공고이므로 "전국"으로 우선 정정한다.
  //     (예: 합강중학교 건 - "참가지역" 라벨은 없지만 "공동도급지역 : 세종특별자치시"가
  //      있어 전국 공고인데, 과거에는 이 문구에서 "세종"을 지역으로 오추출하거나
  //      라벨이 있는 다른 건들은 "충남"/"경기" 등 특정 지역만 표시되어 "전국" 필터에서
  //      누락되고 반대로 해당 지역 필터에는 잘못 노출되는 문제가 있었다.)
  //   - 이때 공동도급지역에 실제 지역/비율 정보가 있으면 "전국/세종49%"처럼
  //     최저(참여 가능) 비율을 함께 표시해 실무자가 공동수급체 구성 조건을
  //     한눈에 볼 수 있게 한다(순수 "전국"보다 정보량이 많음).
  const jointRegionExists = !!jointRegion && jointRegion.trim() !== '없음'
  const baseAmountValue = parseAmountValue(baseAmount)
  const isNationalByRule = jointRegionExists || (baseAmountValue !== null && baseAmountValue >= 1_100_000_000)

  const participantRegion = isNationalByRule
    ? `전국${buildJointRegionSuffix(jointRegion, jointRatio) || ''}`
    : extractField(description, '참가지역') ||
      extractField(description, '지역') ||
      extractRegionFallback(description) ||
      '전국'

  return {
    bid_no: bidNo,
    bid_ord: bidOrd,
    title,
    agency: extractField(description, '발주기관'),
    industry,
    task_type: extractField(description, '업무구분'),
    bid_method: extractField(description, '낙찰방법'),
    base_amount: baseAmount,
    pure_cost: extractField(description, '순공사원가'),
    a_value: extractField(description, 'A값'),
    lower_rate: extractField(description, '낙찰하한율'),
    participant_region: participantRegion,
    joint_region: jointRegion,
    bid_open_recv_date: normalizeDateSeparator(bidOpenRecvDate),
    bid_deadline: normalizeDateSeparator(bidDeadline),
    agreement_deadline: normalizeDateSeparator(extractField(description, '협정마감일시')),
    detail_url: detailUrl
  }
}

export function parseGcalEvent(item: GcalEventItem): ParsedGcalBid {
  const description = normalizeGcalDescription(item.description || '')
  const fields = parseGcalDescription(description, item.summary || null)

  return {
    event_id: item.id,
    summary: item.summary || null,
    location: item.location || null,
    event_start: item.start?.dateTime || item.start?.date || null,
    event_end: item.end?.dateTime || item.end?.date || null,
    html_link: item.htmlLink || null,
    raw_description: description || null,
    ...fields
  }
}

// ------------------------------------------------------------------
// 캘린더 -> D1(gcal_bids) 동기화 파이프라인
// ------------------------------------------------------------------
export async function syncGcalBids(env: GcalBindings): Promise<{ fetched: number; synced: number }> {
  const events = await listCalendarEvents(env)
  const parsed = events.map(parseGcalEvent)

  if (parsed.length === 0) {
    return { fetched: 0, synced: 0 }
  }

  const stmt = env.DB.prepare(`
    INSERT INTO gcal_bids (
      event_id, bid_no, bid_ord, title, summary, agency, industry, task_type,
      bid_method, base_amount, pure_cost, a_value, lower_rate,
      participant_region, joint_region, bid_open_recv_date, bid_deadline,
      agreement_deadline, detail_url, location, event_start, event_end,
      html_link, raw_description, synced_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(event_id) DO UPDATE SET
      bid_no = excluded.bid_no,
      bid_ord = excluded.bid_ord,
      title = excluded.title,
      summary = excluded.summary,
      agency = excluded.agency,
      industry = excluded.industry,
      task_type = excluded.task_type,
      bid_method = excluded.bid_method,
      base_amount = excluded.base_amount,
      pure_cost = excluded.pure_cost,
      a_value = excluded.a_value,
      lower_rate = excluded.lower_rate,
      participant_region = excluded.participant_region,
      joint_region = excluded.joint_region,
      bid_open_recv_date = excluded.bid_open_recv_date,
      bid_deadline = excluded.bid_deadline,
      agreement_deadline = excluded.agreement_deadline,
      detail_url = excluded.detail_url,
      location = excluded.location,
      event_start = excluded.event_start,
      event_end = excluded.event_end,
      html_link = excluded.html_link,
      raw_description = excluded.raw_description,
      synced_at = datetime('now'),
      updated_at = datetime('now')
  `)

  const batch = parsed.map((p) =>
    stmt.bind(
      p.event_id,
      p.bid_no,
      p.bid_ord,
      p.title,
      p.summary,
      p.agency,
      p.industry,
      p.task_type,
      p.bid_method,
      p.base_amount,
      p.pure_cost,
      p.a_value,
      p.lower_rate,
      p.participant_region,
      p.joint_region,
      p.bid_open_recv_date,
      p.bid_deadline,
      p.agreement_deadline,
      p.detail_url,
      p.location,
      p.event_start,
      p.event_end,
      p.html_link,
      p.raw_description
    )
  )

  // D1 batch는 한 번에 너무 많은 문장을 넣으면 실패할 수 있어 100개 단위로 분할
  const CHUNK = 100
  for (let i = 0; i < batch.length; i += CHUNK) {
    await env.DB.batch(batch.slice(i, i + CHUNK))
  }

  return { fetched: events.length, synced: parsed.length }
}

// ------------------------------------------------------------------
// 저장된 raw_description 재파싱(구글 캘린더 API 재조회 없이)
//   - listCalendarEvents()는 timeMin(현재 -30일)~timeMax(현재 +180일) 범위만 조회하므로,
//     입찰서접수마감일시가 이미 30일보다 더 지난 오래된 이벤트는 캘린더 API 응답에서
//     자체가 빠져 syncGcalBids()의 upsert 대상이 되지 못한다. 그 결과 파싱 로직(예: 업종
//     키워드 추가/제목 정제 등)을 고쳐도 이런 오래된 레코드에는 영영 반영되지 않는다.
//     (예: "2026년 적산열량계 설치 및 교체공사" - 마감일 2026/07/23로 이미 30일 범위 밖)
//   - DB에는 원본 raw_description이 이미 저장되어 있으므로, 캘린더 API를 다시 부르지
//     않고 그 텍스트만 최신 parseGcalDescription()으로 다시 돌려 파생 필드(제목/업종/
//     지역 등)를 갱신한다. summary/location/event_start/event_end/html_link처럼
//     description에 없는 원본 이벤트 메타데이터는 그대로 보존한다.
export async function reparseStoredGcalBids(env: GcalBindings): Promise<{ scanned: number; updated: number }> {
  const { results } = await env.DB.prepare(
    `SELECT event_id, raw_description, summary,
            bid_no, bid_ord, title, agency, industry, task_type, bid_method,
            base_amount, pure_cost, a_value, lower_rate, participant_region,
            joint_region, bid_open_recv_date, bid_deadline, agreement_deadline, detail_url
     FROM gcal_bids
     WHERE raw_description IS NOT NULL AND raw_description != ''`
  ).all<Record<string, string | null>>()

  const rows = results || []
  if (rows.length === 0) {
    return { scanned: 0, updated: 0 }
  }

  const FIELD_KEYS: (keyof ParsedGcalFields)[] = [
    'bid_no', 'bid_ord', 'title', 'agency', 'industry', 'task_type', 'bid_method',
    'base_amount', 'pure_cost', 'a_value', 'lower_rate', 'participant_region',
    'joint_region', 'bid_open_recv_date', 'bid_deadline', 'agreement_deadline', 'detail_url'
  ]

  const stmt = env.DB.prepare(`
    UPDATE gcal_bids SET
      bid_no = ?, bid_ord = ?, title = ?, agency = ?, industry = ?, task_type = ?,
      bid_method = ?, base_amount = ?, pure_cost = ?, a_value = ?, lower_rate = ?,
      participant_region = ?, joint_region = ?, bid_open_recv_date = ?, bid_deadline = ?,
      agreement_deadline = ?, detail_url = ?, updated_at = datetime('now')
    WHERE event_id = ?
  `)

  const toUpdate: D1PreparedStatement[] = []
  for (const row of rows) {
    const fresh = parseGcalDescription(row.raw_description || '', row.summary)
    const changed = FIELD_KEYS.some((k) => (fresh[k] ?? null) !== (row[k] ?? null))
    if (!changed) continue

    toUpdate.push(
      stmt.bind(
        fresh.bid_no, fresh.bid_ord, fresh.title, fresh.agency, fresh.industry,
        fresh.task_type, fresh.bid_method, fresh.base_amount, fresh.pure_cost,
        fresh.a_value, fresh.lower_rate, fresh.participant_region, fresh.joint_region,
        fresh.bid_open_recv_date, fresh.bid_deadline, fresh.agreement_deadline,
        fresh.detail_url, row.event_id
      )
    )
  }

  const CHUNK = 100
  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    await env.DB.batch(toUpdate.slice(i, i + CHUNK))
  }

  return { scanned: rows.length, updated: toUpdate.length }
}
