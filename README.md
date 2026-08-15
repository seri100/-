# webapp - 입찰 관리 대시보드

## Project Overview
- **Name**: 입찰 관리 대시보드 (Bid Management Dashboard)
- **Goal**: 기존에 운영 중인 라즈베리파이 자동화(나라장터 공고 수집, 구글 캘린더 동기화, 카카오톡/SMS 알림)는 **그대로 유지**하면서, 그 파이프라인에는 없는 **"우리 팀의 대응 상태(검토중/제출완료, 담당자, 메모)"를 3명이 함께 관리**하는 웹 대시보드를 추가로 제공한다.
- **핵심 설계 원칙**: 이 앱은 데이터를 "새로 수집"하지 않는다. 라즈베리파이의 `gongo/*.csv`(나라장터 원본 수집 데이터)를 그대로 미러링해서 보여주고, 그 위에 상태 관리 기능만 얹는다. 기존 `main_send.py`, `gcal_sync.py`, `bid_collector.py`는 전혀 수정하지 않는다.
- **Features**:
  - 나라장터 입찰공고 목록 조회 (상태/지역/공종/공고명 필터)
  - 공고별 진행상태 관리: `검토중` → `제출완료`
  - 담당자(자유 텍스트), 메모 기록
  - 라즈베리파이 → Cloudflare 간 데이터 업로드용 REST API 및 동기화 스크립트 제공
  - (참고용으로 남겨둔) Task CRUD API 예시: `/api-docs`

## URLs
- **배포 URL (프로덕션)**: https://edd8d6fe-54a1-40b1-99fe-9fb11271c8a0.vip.gensparksite.com
- **메인 대시보드**: `/` (위 URL 그대로 접속)
- **Task API 예시 문서** (이전 튜토리얼 예제, 유지됨): `/api-docs`
- **입찰 관리 API Base**: `/api/bids`
- **로컬 개발 미리보기**: http://localhost:3000

## API 엔드포인트

### 입찰 관리 (신규)
| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| POST | `/api/bids/import` | 라즈베리파이가 gongo CSV 데이터를 업로드(upsert) | `X-API-Key` 헤더 필요 |
| GET | `/api/bids` | 목록 조회. 쿼리: `status`, `region`, `industry`, `q`(공고명 검색), `limit`, `offset` | 없음(내부용 전제) |
| GET | `/api/bids/:bid_no/:bid_ord` | 단일 공고 상세 조회 | 없음 |
| PUT | `/api/bids/:bid_no/:bid_ord/status` | 상태/담당자/메모 수정. Body: `{ status, assignee, memo, updated_by }` | 없음 |

> ⚠️ 현재 조회/수정 API에는 별도 인증이 없습니다(사내 3인 공유 목적, 프로토타입 단계). 외부에 공개되는 것을 원치 않으면 Cloudflare Access 또는 간단한 토큰 인증 추가를 권장합니다. (import 엔드포인트만 API Key로 보호되어 있습니다.)

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

### Task API 예시 (참고용, `/api-docs`에서 유지)
| Method | Path | 설명 |
|--------|------|------|
| GET/POST/PUT/DELETE | `/api/tasks(/:id)` | 이전 튜토리얼에서 만든 CRUD 예제. 신규 개발과 무관, 학습용으로 남겨둠 |

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
| collected_at, imported_at, updated_at | 원본 수집시각 / 최초반영시각 / 최종갱신시각 |

### `bid_status` 테이블 — 사람이 입력하는 상태 정보 (이 앱의 핵심)
| 컬럼 | 설명 |
|---|---|
| bid_no, bid_ord | FK → bids |
| status | `검토중`(기본값) / `제출완료` |
| assignee | 담당자 (자유 텍스트) |
| memo | 자유 메모 |
| updated_by, updated_at | 마지막 수정자/수정시각 |

- **Storage**: Cloudflare D1 (로컬 개발 시 `.wrangler/state/v3/d1` 로컬 SQLite)
- **Migrations**: `migrations/0001_initial_schema.sql`(Task 예제), `migrations/0002_bid_management.sql`(입찰 관리)

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
```

- 구글 캘린더 동기화(`gcal_sync.py`, 09:00/15:00 실행)는 **완전히 그대로 유지**됩니다. 이 앱은 캘린더를 읽거나 쓰지 않습니다.
- `sync_bids_to_cloudflare.py`는 `gongo/*.csv`를 **읽기만** 하며, 기존 파일을 수정하지 않습니다.

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

## Not Yet Implemented
- 조회/수정 API에 대한 접근 인증 (현재 사내 공유 전제, 외부 공개 시 보완 필요)
- 실시간 갱신(polling/websocket 없음, 새로고침 필요)
- 상태 변경 이력(누가 언제 어떤 상태로 바꿨는지 로그) — 현재는 최종 상태만 저장
- 페이지네이션 UI (API는 limit/offset 지원하나 프론트는 아직 미적용)
- `main_send.py`/`gcal_sync.py`가 이미 하는 지역·공종 필터와 이 앱의 필터 기준이 완전히 동일한지는 실제 데이터로 추가 검증 필요

## Next Steps
- 라즈베리파이에 `sync_bids_to_cloudflare.py` 설치 + crontab 등록 (위 안내 참고)
- 실사용 1~2주 후, 상태 변경 이력 로그·간단 인증 추가 여부 재검토
- (선택) 조회/수정 API에 대한 접근 제한 필요 시 Genspark Hosted Access Rules 적용 검토

## Deployment
- **Platform**: Cloudflare Pages (Genspark 관리형 계정, Workers for Platform)
- **Tech Stack**: Hono + TypeScript + Cloudflare D1 + TailwindCSS(CDN)
- **Status**: ✅ 배포 완료 (D1 마이그레이션 수동 적용 후 정상 동작 검증됨)
- **배포 URL**: https://edd8d6fe-54a1-40b1-99fe-9fb11271c8a0.vip.gensparksite.com
- **Last Updated**: 2026-08-15
