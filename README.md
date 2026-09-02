# webapp - 입찰 관리 대시보드

> 📘 개발 지식 없이 화면 사용법만 알고 싶다면 **[관리자 사용 설명서 (MANUAL.md)](./MANUAL.md)** 를 참고하세요. 이 README는 개발자용 기술 문서입니다.

## Project Overview
- **Name**: 입찰 관리 대시보드 (Bid Management Dashboard)
- **Goal**: 기존에 운영 중인 라즈베리파이 자동화(나라장터 공고 수집, 구글 캘린더 동기화, 카카오톡/SMS 알림)는 **그대로 유지**하면서, 그 파이프라인에는 없는 **"우리 팀의 대응 상태(검토중/제출완료, 담당자, 메모)"를 3명이 함께 관리**하는 웹 대시보드를 추가로 제공한다.
- **핵심 설계 원칙**: 이 앱은 데이터를 "새로 수집"하지 않는다. 라즈베리파이의 `gongo/*.csv`(나라장터 원본 수집 데이터)를 그대로 미러링해서 보여주고, 그 위에 상태 관리 기능만 얹는다. 기존 `main_send.py`, `gcal_sync.py`, `bid_collector.py`는 전혀 수정하지 않는다.
- **Features**:
  - 나라장터 입찰공고 목록 조회 (상태/지역/공종/공고명 필터, 지역·공종은 드롭다운 선택)
  - 공고별 진행상태 관리: `검토중` → `제출완료`
  - 담당자(자유 텍스트), 메모 기록
  - "입찰개시일"(입찰서접수개시일시) 컬럼 표시
  - 라즈베리파이 → Cloudflare 간 데이터 업로드용 REST API 및 동기화 스크립트 제공
  - **[신규] 구글 캘린더 기준 별도 대시보드 (`/gcal`)**: 라즈베리파이 CSV를 거치지 않고 Cloudflare Worker가 Google Calendar API를 직접 호출해 입찰개시 이벤트를 가져와, 동일한 상태/담당자/메모 관리 기능을 제공. 기존 대시보드(`/`)와 완전히 독립된 데이터/테이블 사용
  - **[신규] PC/모바일 아이콘**: 브라우저 탭 파비콘, 모바일 홈화면 추가용 앱 아이콘(iOS/Android), PWA manifest 제공 — 모바일에서 "홈 화면에 추가"로 앱처럼 접근 가능

## URLs
- **배포 URL (프로덕션)**: https://edd8d6fe-54a1-40b1-99fe-9fb11271c8a0.vip.gensparksite.com
- **메인 대시보드 (라즈베리파이 기준)**: `/` (위 URL 그대로 접속)
- **구글 캘린더 기준 대시보드 (신규)**: `/gcal`
- **입찰 관리 API Base (라즈베리파이 기준)**: `/api/bids`
- **입찰 관리 API Base (구글 캘린더 기준, 신규)**: `/api/gcal-bids`
- **로컬 개발 미리보기**: http://localhost:3000

> ✅ "구글 캘린더 기준" 관련 URL·API는 프로덕션에 배포 완료되었습니다 (원격 D1 마이그레이션 적용, `GCAL_SERVICE_ACCOUNT_JSON`/`GCAL_CALENDAR_ID` 시크릿 등록, 재배포까지 완료). 배포 직후 "캘린더 동기화" 1회 실행으로 초기 적재(310건)도 완료했습니다.

## API 엔드포인트

### 입찰 관리 - 라즈베리파이 기준 (`/api/bids`)
| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| POST | `/api/bids/import` | 라즈베리파이가 gongo CSV 데이터를 업로드(upsert). `bid_open_recv_date`(입찰개시일) 포함 | `X-API-Key` 헤더 필요 |
| GET | `/api/bids` | 목록 조회. 쿼리: `status`, `region`, `industry`, `q`(공고명 검색), `limit`, `offset` | 없음(내부용 전제) |
| GET | `/api/bids/:bid_no/:bid_ord` | 단일 공고 상세 조회 | 없음 |
| PUT | `/api/bids/:bid_no/:bid_ord/status` | 상태/담당자/메모 수정. Body: `{ status, assignee, memo, updated_by }` | 없음 |

> ⚠️ 현재 조회/수정 API에는 별도 인증이 없습니다(사내 3인 공유 목적, 프로토타입 단계). 외부에 공개되는 것을 원치 않으면 Cloudflare Access 또는 간단한 토큰 인증 추가를 권장합니다. (import 엔드포인트만 API Key로 보호되어 있습니다.)

### 입찰 관리 - 구글 캘린더 기준 (신규, `/api/gcal-bids`)
| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| POST | `/api/gcal-bids/sync` | Google Calendar API를 직접 호출해 이벤트를 가져와 `gcal_bids`에 upsert. `/gcal` 페이지의 "캘린더 동기화" 버튼에서 호출 | 없음(내부용 전제) |
| GET | `/api/gcal-bids` | 목록 조회. 쿼리: `status`, `region`, `industry`, `q`, `limit`, `offset` | 없음 |
| GET | `/api/gcal-bids/:event_id` | 단일 이벤트 상세 조회 | 없음 |
| PUT | `/api/gcal-bids/:event_id/status` | 상태/담당자/메모 수정 | 없음 |

- 데이터 소스: 서비스 계정(`ck-bid@mp-2026-494806.iam.gserviceaccount.com`)이 접근 권한을 가진 구글 캘린더(`ck4642060@gmail.com`, 라즈베리파이 `main_send.py`가 실제로 이벤트를 쓰는 캘린더)
- 인증: Cloudflare Worker에서 Web Crypto API로 서비스 계정 JWT를 직접 서명 → Google OAuth2 토큰 교환 (Node.js `googleapis` 패키지 미사용, Workers 런타임 호환)
- 파싱 대상: 캘린더 이벤트의 `summary`(제목: `[입찰개시] 공고명`)와 `description`(HTML, `<br>` 개행 - 정규화 후 "라벨 : 값" 형식으로 파싱)
- 이 캘린더는 라즈베리파이의 `modules/calendar_sync.py` 필터링 로직에 의해 **이미 필터된 공고만** 들어있습니다: LH/한국토지주택공사 제외, (추정가격 10억원 이상) 또는 (충북/세종 지역)만 동기화됨. 즉 `/gcal` 대시보드는 라즈베리파이 기준 대시보드(`/`, 전체 나라장터 공고)보다 적은 수의 "중요 공고"만 보여줍니다.
- 캘린더에는 신/구 포맷 이벤트가 혼재되어 있어(과거 다른 스크립트가 만든 이벤트 포함), 라벨이 없는 구버전 이벤트는 날짜범위 텍스트/상세URL 쿼리파라미터에서 폴백으로 정보를 추출합니다(자세한 내용은 `src/gcal.ts` 참고).

### curl 예시
```bash
# 목록 조회 (전체)
curl http://localhost:3000/api/bids

# 필터: 상태=검토중, 지역에 "충북" 포함
curl "http://localhost:3000/api/bids?status=검토중&region=충북"

# 상태 변경 (담당자/메모 포함)
curl -X PUT http://localhost:3000/api/bids/20260801001/00/status \
  -H "Content-Type: application/json" \
  -d '{"status":"제출완료","assignee":"홍길동","memo":"서류 제출 완료"}'

# (라즈베리파이 전용) 데이터 업로드
curl -X POST http://localhost:3000/api/bids/import \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <IMPORT_API_KEY>" \
  -d '{"items":[{"bid_no":"20260804004","bid_ord":"00","title":"...", "region":"충북", ...}]}'
```

### curl 예시 (구글 캘린더 기준, 신규)
```bash
# 캘린더 → D1 동기화 (버튼과 동일한 요청)
curl -X POST http://localhost:3000/api/gcal-bids/sync

# 목록 조회
curl "http://localhost:3000/api/gcal-bids?region=충북"

# 상태 변경
curl -X PUT http://localhost:3000/api/gcal-bids/<event_id>/status \
  -H "Content-Type: application/json" \
  -d '{"status":"제출완료","assignee":"홍길동","memo":"서류 제출 완료"}'
```

## Data Architecture

### `bids` 테이블 — 나라장터 원본 미러
라즈베리파이 `gongo/*.csv`(공사_YYYYMMDD.csv, 물품_YYYYMMDD.csv)의 핵심 컬럼만 추려서 저장. Primary Key는 `(bid_no, bid_ord)`로, 기존 `n_data/state.db`의 `sent_log` 테이블과 동일한 키 체계를 사용해 향후 연계가 쉽도록 맞췄습니다.

| 컬럼 | 설명 |
|---|---|
| bid_no, bid_ord | 입찰공고번호, 차수 (PK) |
| category | 공사 / 물품 |
| title, agency, demand_agency | 공고명, 발주기관, 수요기관 |
| main_industry, region | 주공종명, 공사현장지역 |
| bid_method, contract_method | 입찰방법, 계약방법 |
| estimated_price, budget_amount | 추정가격, 배정예산 |
| notice_date, bid_deadline, open_date | 공고일시, 입찰마감일시, 개찰일시 |
| detail_url | 나라장터 상세페이지 URL |
| bid_open_recv_date | 입찰서접수개시일시(입찰개시일) |
| collected_at, imported_at, updated_at | 원본 수집시각 / 최초반영시각 / 최종갱신시각 |

### `bid_status` 테이블 — 사람이 입력하는 상태 정보 (이 앱의 핵심)
| 컬럼 | 설명 |
|---|---|
| bid_no, bid_ord | FK → bids |
| status | `검토중`(기본값) / `제출완료` |
| assignee | 담당자 (자유 텍스트) |
| memo | 자유 메모 |
| updated_by, updated_at | 마지막 수정자/수정시각 |

### `gcal_bids` 테이블 — 구글 캘린더 이벤트 파싱 결과 (신규, 완전 별도)
Primary Key는 구글 캘린더 이벤트 id(`event_id`) 그대로 사용합니다.

| 컬럼 | 설명 |
|---|---|
| event_id | 구글 캘린더 이벤트 id (PK) |
| bid_no, bid_ord | 공고번호, 차수 (description 또는 상세URL에서 파싱) |
| title, summary | 공고명, 캘린더 이벤트 제목(`[입찰개시] 공고명`) |
| agency, industry, task_type, bid_method | 발주기관, 업종, 업무구분(공사/물품), 낙찰방법 |
| base_amount, pure_cost, a_value, lower_rate | 기초금액, 순공사원가, A값(공사), 낙찰하한율(물품) |
| participant_region, joint_region | 참가지역, 공동도급지역 |
| bid_open_recv_date, bid_deadline, agreement_deadline | 입찰서접수개시일시, 입찰마감일시, 협정마감일시 |
| detail_url | 나라장터 상세페이지 URL |
| location, event_start, event_end, html_link | 캘린더 이벤트 원본 필드(장소/시작/종료/보기링크) |
| raw_description | 정규화된(HTML→텍스트) description 전문 (파싱 실패 대비 보관) |
| synced_at, imported_at, updated_at | 마지막 캘린더 동기화 / 최초반영 / 최종갱신 시각 |

### `gcal_bid_status` 테이블 — 구글 캘린더 대시보드용 상태 정보 (신규, 완전 별도)
| 컬럼 | 설명 |
|---|---|
| event_id | FK → gcal_bids |
| status | `검토중`(기본값) / `제출완료` |
| assignee | 담당자 (자유 텍스트) |
| memo | 자유 메모 |
| updated_by, updated_at | 마지막 수정자/수정시각 |

- **Storage**: Cloudflare D1 (로컬 개발 시 `.wrangler/state/v3/d1` 로컬 SQLite)
- **Migrations**: `migrations/0001_initial_schema.sql`(초기 예제, 더 이상 사용하지 않음 - `backup/legacy-task-api-example/` 참고), `migrations/0002_bid_management.sql`(입찰 관리), `migrations/0003_add_bid_open_date.sql`(입찰개시일 컬럼), `migrations/0004_gcal_bids.sql`(구글 캘린더 대시보드용 신규 테이블)

## 데이터 흐름 (라즈베리파이 ↔ Cloudflare)

```
[라즈베리파이, 기존 그대로]                [Cloudflare, 신규]
bid_collector.py (08:00, 14:00)
    │ 나라장터 전체 공고 수집
    ▼
gongo/공사_YYYYMMDD.csv
gongo/물품_YYYYMMDD.csv
    │
    │  scripts/sync_bids_to_cloudflare.py  (신규 추가 스크립트, cron 등록 필요)
    │  - 기계설비·소방설비 공종 + 전국/충북/세종 지역만 필터
    │    (기존 gcal_sync.py와 동일한 취지의 필터 기준)
    │  - POST /api/bids/import (X-API-Key 인증)
    ▼
                                          D1: bids (upsert)
                                              │
                                          D1: bid_status (3인이 웹에서 직접 입력)
                                              │
                                          웹 대시보드 (/) - 목록/필터/상태변경


[구글 캘린더, 신규]                        [Cloudflare, 신규]
ck4642060@gmail.com
(main_send.py → modules/calendar_sync.py가
 기존처럼 그대로 이벤트를 씀. 이 앱은 캘린더에 쓰지 않고 읽기만 함)
    │
    │  "캘린더 동기화" 버튼 클릭
    │  POST /api/gcal-bids/sync
    │  - Worker가 서비스 계정 JWT를 Web Crypto API로 직접 서명
    │  - Google OAuth2 토큰 교환 → Calendar events.list REST 호출
    │  - description(HTML) 정규화 후 라벨 기반 파싱 (구버전 이벤트는 폴백 파싱)
    ▼
                                          D1: gcal_bids (upsert)
                                              │
                                          D1: gcal_bid_status (3인이 웹에서 직접 입력)
                                              │
                                          웹 대시보드 (/gcal) - 목록/필터/상태변경
```

- 구글 캘린더 동기화(`gcal_sync.py`/`calendar_sync.py`, 09:00/15:00 실행)는 **완전히 그대로 유지**됩니다. `/gcal` 대시보드는 이 캘린더를 **읽기 전용**으로 조회할 뿐, 캘린더에 쓰지 않습니다.
- `sync_bids_to_cloudflare.py`는 `gongo/*.csv`를 **읽기만** 하며, 기존 파일을 수정하지 않습니다.
- `/gcal` 경로는 라즈베리파이 CSV 파이프라인과 **완전히 독립**되어 있어, 위 CSV 동기화(`sync_bids_to_cloudflare.py`)가 라즈베리파이에 아직 설치되지 않았어도 정상 동작합니다. 필요한 건 캘린더 접근 권한(서비스 계정)뿐입니다.

> ℹ️ 아래 "라즈베리파이 설정 방법"은 `/`(라즈베리파이 기준) 대시보드에만 해당합니다. `/gcal` 대시보드는 라즈베리파이에 아무것도 설치하지 않아도 되며, Cloudflare 쪽 시크릿/D1 설정만으로 동작합니다 (프로덕션 배포 완료, 아래 "Deployment" 참고).

## 라즈베리파이 설정 방법 (배포 완료, 아래만 진행하면 됨)

배포 및 `IMPORT_API_KEY` 시크릿 등록이 완료된 상태입니다. 라즈베리파이에서 아래만 진행하면 됩니다.

1. **라즈베리파이에 동기화 스크립트 복사**:
   ```bash
   scp scripts/sync_bids_to_cloudflare.py pi@<라즈베리파이IP>:/home/pi/gongo/
   ```
2. **1회 수동 테스트** (아래 `<IMPORT_API_KEY 값>`은 대화방/문서 등 안전한 채널로 별도 전달받은 값을 사용):
   ```bash
   BID_API_BASE=https://edd8d6fe-54a1-40b1-99fe-9fb11271c8a0.vip.gensparksite.com \
   BID_API_KEY=<IMPORT_API_KEY 값> \
     python3 /home/pi/gongo/sync_bids_to_cloudflare.py
   ```
3. **crontab에 한 줄 추가** (기존 `bid_collector.py`가 08:00/14:00에 도는 것을 감안해 10분 뒤로 설정):
   ```
   10 8,14 * * * BID_API_BASE=https://edd8d6fe-54a1-40b1-99fe-9fb11271c8a0.vip.gensparksite.com BID_API_KEY=<IMPORT_API_KEY 값> /usr/bin/python3 /home/pi/gongo/sync_bids_to_cloudflare.py >> /home/pi/n_data/logs/bid_sync.log 2>&1
   ```

> 🔑 `IMPORT_API_KEY` 값은 보안상 이 문서에 평문으로 남기지 않았습니다. Cloudflare Worker 시크릿은 **쓰기 전용**이라 나중에 다시 조회할 수 없으니, 채팅으로 전달받은 값을 라즈베리파이의 crontab 또는 `/home/pi/gongo/.env_bid_sync` 같은 별도 파일에 안전하게 보관해두세요. 분실 시 `gsk hosted secret_put`으로 새 값을 재등록하고 라즈베리파이 쪽 값도 함께 갱신하면 됩니다.

자세한 옵션은 스크립트 상단 docstring(`scripts/sync_bids_to_cloudflare.py`) 참고.

## User Guide
1. `/` 접속 → 입찰 공고 목록 확인 (기본: 마감일 임박순 정렬)
2. 상단 필터바에서 상태/지역/공종/공고명으로 좁혀보기
3. 목록의 "상태" 배지 클릭 → 모달에서 상태(검토중/제출완료), 담당자, 메모 입력 후 저장
4. 3명이 각자 접속해서 동일한 목록을 보고 상태를 함께 갱신 (실시간 동기화는 아니며, 새로고침 시 최신 상태 반영)

### `/gcal` (구글 캘린더 기준 대시보드) 사용법
1. `/gcal` 접속 (또는 `/` 상단의 "구글 캘린더 기준 대시보드 보기" 링크 클릭)
2. 처음 열었거나 최신 캘린더 내용을 반영하고 싶으면 **"캘린더 동기화"** 버튼을 먼저 클릭 (Google Calendar → D1로 upsert, 자동 주기 동기화는 없음)
3. 동기화 완료 후 목록이 표시되며, 상단 필터바(상태/지역/공종/공고명)로 좁혀보기 가능
4. 목록의 "상태" 배지 클릭 → 모달에서 상태/담당자/메모 입력 후 저장 (`/` 대시보드와 완전히 별도 데이터이므로 서로 영향 없음)
5. 참고: 이 캘린더는 이미 라즈베리파이 필터(LH 제외, 추정가격 10억 이상 또는 충북/세종)를 통과한 "중요 공고"만 담고 있어, `/` 목록보다 건수가 적습니다.

## Not Yet Implemented
- 조회/수정 API에 대한 접근 인증 (현재 사내 공유 전제, 외부 공개 시 보완 필요)
- 실시간 갱신(polling/websocket 없음, 새로고침 필요)
- 상태 변경 이력(누가 언제 어떤 상태로 바꿨는지 로그) — 현재는 최종 상태만 저장
- 페이지네이션 UI (API는 limit/offset 지원하나 프론트는 아직 미적용)
- `main_send.py`/`gcal_sync.py`가 이미 하는 지역·공종 필터와 이 앱의 필터 기준이 완전히 동일한지는 실제 데이터로 추가 검증 필요
- **[신규] 캘린더 내 구버전 이벤트 파싱 한계**: 프로덕션 동기화 기준 310건 중 약 152건은 `main_send.py`의 과거 버전이 만든 완전 구버전 포맷(라벨 없음)이라 제목/기간 등 최소 정보만 파싱됨. 나머지 신포맷(`[입찰개시] ...`) 이벤트는 대부분 필드가 정상 파싱됨 (로컬 검증 기준 157건 중 공고번호 154건, 입찰마감 156건, 발주기관 150건 파싱 성공)
- **[신규] `/gcal`은 수동 동기화만 지원** — 버튼을 눌러야 최신 캘린더 내용이 반영되며, 자동 주기 동기화(cron 등)는 아직 없음

## Next Steps
- 라즈베리파이에 `sync_bids_to_cloudflare.py` 설치 + crontab 등록 (위 안내 참고, `/` 대시보드용)
- 실사용 1~2주 후, 상태 변경 이력 로그·간단 인증 추가 여부 재검토
- (선택) 조회/수정 API에 대한 접근 제한 필요 시 Genspark Hosted Access Rules 적용 검토
- 구버전(라벨 없는) 캘린더 이벤트 약 152건의 데이터 품질을 어느 정도까지 개선할지 사용자와 협의 (현재는 최소 정보만 표시, 기능상 지장은 없음)
- `/gcal` 자동 주기 동기화(cron 등) 도입 여부 검토 (현재는 수동 버튼만 지원)

## Deployment
- **Platform**: Cloudflare Pages (Genspark 관리형 계정, Workers for Platform)
- **Tech Stack**: Hono + TypeScript + Cloudflare D1 + TailwindCSS(CDN)
- **Status**: ✅ `/`(라즈베리파이 기준), `/gcal`(구글 캘린더 기준) 모두 배포 완료. `/gcal`은 원격 D1에 `gcal_bids`/`gcal_bid_status` 테이블 생성(0003/0004 마이그레이션 내용 적용) + `GCAL_SERVICE_ACCOUNT_JSON`/`GCAL_CALENDAR_ID` 시크릿 등록 + 재배포까지 완료하고, 배포 직후 "캘린더 동기화" API를 1회 호출해 D1에 310건 초기 적재를 완료함
- **배포 URL**: https://edd8d6fe-54a1-40b1-99fe-9fb11271c8a0.vip.gensparksite.com (`/`, `/gcal` 모두 실제 서비스 중)
- **Last Updated**: 2026-09-02

### PC/모바일 아이콘 (신규)
- `public/favicon.ico`(16/32/48 멀티사이즈), `public/static/icons/*.png`(16/32/48/180/192/512), `public/static/manifest.json`(PWA) 추가
- `src/renderer.tsx`(`/`, `/gcal` 공용 head), `src/index.tsx`의 `/manual` head에 `<link rel="icon">`, `<link rel="apple-touch-icon">`, `<link rel="manifest">`, `theme-color` 메타태그 삽입
- **모바일에서 사용법**: iOS Safari → 공유 버튼 → "홈 화면에 추가" / Android Chrome → 메뉴(⋮) → "앱 설치" 또는 "홈 화면에 추가"를 누르면 위 아이콘이 적용된 앱처럼 홈 화면에 추가됨
- 참고: Cloudflare Pages 빌드 시 `_routes.json`이 정적 파일 추가 후에도 재생성되지 않는 이슈가 있어 `dist/_routes.json`을 삭제 후 재빌드해야 신규 정적 파일(`/favicon.ico` 등)이 Worker를 거치지 않고 직접 서빙됨 (`@hono/vite-build/cloudflare-pages` 플러그인이 기존 `_routes.json` 존재 시 재생성을 스킵하는 동작)
