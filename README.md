# webapp - Task REST API 예시

## Project Overview
- **Name**: Task API 서버 예시
- **Goal**: Hono + Cloudflare D1을 이용한 경량 REST API 서버 데모
- **Features**:
  - Task(할 일) 리소스에 대한 완전한 CRUD API
  - Cloudflare D1(SQLite) 기반 영속 데이터 저장
  - completed 상태 필터링 쿼리 파라미터 지원
  - 실시간으로 API를 호출해 볼 수 있는 웹 데모 페이지

## URLs
- **로컬 미리보기**: http://localhost:3000 (GetServiceUrl로 공개 URL 발급 가능)
- **API Base**: `/api/tasks`

## API 엔드포인트

| Method | Path | 설명 | Body 예시 |
|--------|------|------|-----------|
| GET | `/api/tasks` | 전체 목록 조회 (`?completed=true/false` 필터 지원) | - |
| GET | `/api/tasks/:id` | 단일 항목 조회 | - |
| POST | `/api/tasks` | 신규 생성 | `{ "title": "...", "description": "..." }` |
| PUT | `/api/tasks/:id` | 수정 | `{ "title", "description", "completed" }` (부분 업데이트 가능) |
| DELETE | `/api/tasks/:id` | 삭제 | - |

### curl 예시
```bash
# 전체 목록
curl http://localhost:3000/api/tasks

# 완료되지 않은 항목만
curl "http://localhost:3000/api/tasks?completed=false"

# 생성
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"장보기","description":"우유, 계란"}'

# 수정 (완료 처리)
curl -X PUT http://localhost:3000/api/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"completed":true}'

# 삭제
curl -X DELETE http://localhost:3000/api/tasks/1
```

## Data Architecture
- **Data Model**: `tasks` 테이블
  - `id` (INTEGER PK, AUTOINCREMENT)
  - `title` (TEXT, NOT NULL)
  - `description` (TEXT, nullable)
  - `completed` (INTEGER, 0/1, default 0)
  - `created_at`, `updated_at` (DATETIME)
- **Storage**: Cloudflare D1 (로컬 개발 시 `.wrangler/state/v3/d1`의 로컬 SQLite 사용)
- **Migration**: `migrations/0001_initial_schema.sql`

## User Guide
1. 브라우저에서 `/` 접속 시 API 문서 + 라이브 데모 페이지 확인 가능
2. 입력창에 할 일 제목을 넣고 "추가" 버튼 클릭 → POST 요청으로 생성
3. 체크박스 클릭 → PUT 요청으로 완료 상태 토글
4. 휴지통 아이콘 클릭 → DELETE 요청으로 삭제
5. curl/Postman 등으로 API를 직접 호출해도 동일하게 동작

## Not Yet Implemented
- 인증/인가 (현재는 공개 API)
- 페이지네이션 (목록이 많아질 경우 필요)
- 입력값에 대한 상세 유효성 검증 (길이 제한 등)

## Next Steps
- 프로덕션 D1 데이터베이스 생성 후 `wrangler.jsonc`의 `database_id` 교체
- `npx wrangler pages deploy dist`로 Cloudflare Pages 배포
- 필요 시 JWT 기반 인증 미들웨어 추가

## Deployment
- **Platform**: Cloudflare Pages (로컬 개발 중, 배포 전 상태)
- **Tech Stack**: Hono + TypeScript + D1 + TailwindCSS(CDN)
- **Last Updated**: 2026-08-14
