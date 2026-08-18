-- ============================================================
-- 구글 캘린더 기반 입찰 관리 대시보드 (기존 bids/bid_status와 완전 별도)
-- 데이터 소스: 구글 캘린더 API 직접 호출 (라즈베리파이 CSV 미경유)
-- 캘린더 이벤트의 id를 그대로 PK로 사용한다 (google_event_id).
-- ============================================================

-- 구글 캘린더 이벤트를 파싱해 저장하는 원본 미러
CREATE TABLE IF NOT EXISTS gcal_bids (
  event_id TEXT PRIMARY KEY,        -- 구글 캘린더 이벤트 id (예: bid<sha1>)
  bid_no TEXT,                      -- 공고번호 (파싱, 예: R26BK01522966)
  bid_ord TEXT,                     -- 차수 (파싱, 예: 000)
  title TEXT,                       -- 공고명
  summary TEXT,                     -- 캘린더 이벤트 제목([입찰개시] 공고명)
  agency TEXT,                      -- 발주기관
  industry TEXT,                    -- 업종
  task_type TEXT,                   -- 업무구분 (공사 | 물품)
  bid_method TEXT,                  -- 낙찰방법
  base_amount TEXT,                 -- 기초금액
  pure_cost TEXT,                   -- 순공사원가 (공사)
  a_value TEXT,                     -- A값 (공사)
  lower_rate TEXT,                  -- 낙찰하한율 (물품)
  participant_region TEXT,          -- 참가지역
  joint_region TEXT,                -- 공동도급지역
  bid_open_recv_date TEXT,          -- 입찰서접수개시일시(입찰개시일)
  bid_deadline TEXT,                -- 입찰마감일시
  agreement_deadline TEXT,          -- 협정마감일시
  detail_url TEXT,                  -- 상세URL
  location TEXT,                    -- 캘린더 이벤트 location 필드(원문)
  event_start TEXT,                 -- 캘린더 이벤트 시작 dateTime(ISO)
  event_end TEXT,                   -- 캘린더 이벤트 종료 dateTime(ISO)
  html_link TEXT,                   -- 구글 캘린더 이벤트 보기 링크
  raw_description TEXT,             -- 원문 description 전체(파싱 실패 대비 보관)
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),   -- 마지막 캘린더 동기화 시각
  imported_at TEXT NOT NULL DEFAULT (datetime('now')), -- 최초 반영 시각
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))   -- 마지막 갱신 시각
);

CREATE INDEX IF NOT EXISTS idx_gcal_bids_deadline ON gcal_bids(bid_deadline);
CREATE INDEX IF NOT EXISTS idx_gcal_bids_region ON gcal_bids(participant_region);
CREATE INDEX IF NOT EXISTS idx_gcal_bids_industry ON gcal_bids(industry);

-- 사람이 관리하는 상태 정보 (기존 bid_status와 동일한 개념, 완전 별도 테이블)
CREATE TABLE IF NOT EXISTS gcal_bid_status (
  event_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT '검토중',  -- 검토중 | 제출완료
  assignee TEXT,                          -- 담당자 (자유 텍스트)
  memo TEXT,                              -- 자유 메모
  updated_by TEXT,                        -- 마지막으로 수정한 사람(선택 입력)
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (event_id) REFERENCES gcal_bids(event_id)
);
