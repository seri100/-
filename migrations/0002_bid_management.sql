-- ============================================================
-- 입찰 관리 앱: 원본 미러(bids) + 상태관리(bid_status) 테이블
-- 라즈베리파이 gongo/*.csv 데이터를 그대로 미러링하고,
-- 사람이 입력하는 상태정보는 별도 테이블로 분리 관리한다.
-- (bid_no, bid_ord)는 기존 n_data/state.db의 sent_log와 동일한 키 체계)
-- ============================================================

-- 나라장터 원본 공고 데이터 (라즈베리파이가 매일 upsert)
CREATE TABLE IF NOT EXISTS bids (
  bid_no TEXT NOT NULL,              -- 입찰공고번호
  bid_ord TEXT NOT NULL,             -- 차수
  category TEXT,                     -- 공사 | 물품 (CSV 파일명 기준)
  title TEXT,                        -- 입찰공고명
  agency TEXT,                       -- 공고기관명
  demand_agency TEXT,                -- 수요기관명
  main_industry TEXT,                -- 주공종명(mainCnsttyNm)
  region TEXT,                       -- 공사현장지역명(cnstrtsiteRgnNm)
  bid_method TEXT,                   -- 입찰방법
  contract_method TEXT,              -- 계약방법
  estimated_price TEXT,              -- 추정가격
  budget_amount TEXT,                -- 배정예산(bdgtAmt)
  notice_date TEXT,                  -- 공고일시
  bid_deadline TEXT,                 -- 입찰마감일시
  open_date TEXT,                    -- 개찰일시
  detail_url TEXT,                   -- 공고 상세 URL
  collected_at TEXT,                 -- 수집일시(원본 CSV 값)
  imported_at TEXT NOT NULL DEFAULT (datetime('now')), -- 이 앱에 최초 반영된 시각
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),  -- 마지막 갱신 시각
  PRIMARY KEY (bid_no, bid_ord)
);

CREATE INDEX IF NOT EXISTS idx_bids_deadline ON bids(bid_deadline);
CREATE INDEX IF NOT EXISTS idx_bids_region ON bids(region);
CREATE INDEX IF NOT EXISTS idx_bids_industry ON bids(main_industry);

-- 사람이 관리하는 상태 정보 (웹 화면에서 3인이 직접 입력/수정)
CREATE TABLE IF NOT EXISTS bid_status (
  bid_no TEXT NOT NULL,
  bid_ord TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '검토중',  -- 검토중 | 제출완료
  assignee TEXT,                          -- 담당자 (자유 텍스트)
  memo TEXT,                              -- 자유 메모
  updated_by TEXT,                        -- 마지막으로 수정한 사람(선택 입력)
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (bid_no, bid_ord),
  FOREIGN KEY (bid_no, bid_ord) REFERENCES bids(bid_no, bid_ord)
);
