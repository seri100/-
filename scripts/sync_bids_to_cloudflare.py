#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_bids_to_cloudflare.py
---------------------------------------------------------------
목적:
  /home/pi/gongo/ 에 매일 쌓이는 나라장터 원본 CSV(공사_YYYYMMDD.csv,
  물품_YYYYMMDD.csv)를 읽어, 기존 gcal_sync.py와 "동일한 기준"(기계설비/
  소방설비 공종 + 전국/충북(청주)/세종 지역)으로 필터링한 뒤,
  Cloudflare Worker의 /api/bids/import 엔드포인트로 업로드한다.

  * 기존 bid_collector.py, main_send.py, gcal_sync.py는 전혀 건드리지 않는다.
  * 이 스크립트는 gongo/*.csv 를 "읽기만" 한다 (원본 파일 수정 없음).
  * Cloudflare 쪽 bids 테이블은 (bid_no, bid_ord) 기준 upsert 이므로
    여러 번 실행해도 중복 저장되지 않는다.

설치(최초 1회):
  pip3 install requests   # 이미 설치되어 있다면 생략

crontab 추가 예시 (gongo 수집이 끝나는 08:10, 14:10에 실행 - 기존 bid_collector.py
가 08:00, 14:00에 도는 것을 감안해 10분 뒤로 잡음):
  10 8,14 * * * /usr/bin/python3 /home/pi/gongo/sync_bids_to_cloudflare.py >> /home/pi/n_data/logs/bid_sync.log 2>&1

환경변수 (crontab에 함께 등록하거나 /home/pi/gongo/.env_bid_sync 파일로 관리):
  BID_API_BASE   - 예: https://webapp.pages.dev  (배포된 Cloudflare Pages URL)
  BID_API_KEY    - Cloudflare Worker에 wrangler secret으로 등록한 IMPORT_API_KEY 값
  GONGO_DIR      - 기본값 /home/pi/gongo (CSV가 있는 디렉토리)
"""

import csv
import os
import sys
import glob
import json
import argparse
from datetime import datetime, timedelta

try:
    import requests
except ImportError:
    print("[ERROR] requests 모듈이 없습니다. 'pip3 install requests' 실행 후 다시 시도하세요.")
    sys.exit(1)

# ------------------------------------------------------------------
# 설정
# ------------------------------------------------------------------
GONGO_DIR = os.environ.get("GONGO_DIR", "/home/pi/gongo")
API_BASE = os.environ.get("BID_API_BASE", "").rstrip("/")
API_KEY = os.environ.get("BID_API_KEY", "")
BATCH_SIZE = 150  # Worker의 MAX_BATCH(200)보다 여유 있게

# gcal_sync.py와 동일한 필터 기준
# - 공종: 기계설비, 소방설비 관련 공종명에 포함되는 키워드로 판단
#   (gcal_sync.py는 공종 "코드"로 필터링하지만, gongo CSV에는 코드 컬럼이
#    노출되어 있지 않아 텍스트(mainCnsttyNm) 기준으로 동일한 의도를 구현함)
TARGET_INDUSTRY_KEYWORDS = ["기계설비", "소방설비", "소방시설"]

# - 지역: 전국 / 충북(청주 포함) / 세종
TARGET_REGION_KEYWORDS = ["전국", "충북", "충청북도", "청주", "세종"]


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}")


def matches_filter(main_industry: str, region: str) -> bool:
    """gcal_sync.py와 동일한 취지의 공종+지역 필터"""
    industry_ok = any(kw in (main_industry or "") for kw in TARGET_INDUSTRY_KEYWORDS)
    region_ok = any(kw in (region or "") for kw in TARGET_REGION_KEYWORDS)
    return industry_ok and region_ok


def csv_category_from_filename(path: str) -> str:
    name = os.path.basename(path)
    if name.startswith("공사"):
        return "공사"
    if name.startswith("물품"):
        return "물품"
    return "기타"


def row_to_bid_item(row: dict, category: str) -> dict:
    """gongo CSV의 한 행 -> Cloudflare bids 테이블 컬럼으로 매핑"""
    return {
        "bid_no": (row.get("입찰공고번호") or "").strip(),
        "bid_ord": (row.get("차수") or "00").strip() or "00",
        "category": category,
        "title": row.get("입찰공고명"),
        "agency": row.get("공고기관명"),
        "demand_agency": row.get("수요기관명"),
        "main_industry": row.get("mainCnsttyNm"),
        "region": row.get("cnstrtsiteRgnNm"),
        "bid_method": row.get("입찰방법"),
        "contract_method": row.get("계약방법"),
        "estimated_price": row.get("추정가격"),
        "budget_amount": row.get("bdgtAmt"),
        "notice_date": row.get("공고일시"),
        "bid_deadline": row.get("입찰마감일시"),
        "open_date": row.get("개찰일시"),
        "detail_url": row.get("공고URL") or row.get("bidNtceDtlUrl"),
        "collected_at": row.get("수집일시"),
    }


def read_and_filter_csv(path: str) -> list:
    category = csv_category_from_filename(path)
    items = []
    skipped_no_key = 0
    try:
        with open(path, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                main_industry = row.get("mainCnsttyNm")
                region = row.get("cnstrtsiteRgnNm")
                if not matches_filter(main_industry, region):
                    continue
                item = row_to_bid_item(row, category)
                if not item["bid_no"]:
                    skipped_no_key += 1
                    continue
                items.append(item)
    except FileNotFoundError:
        log(f"  (파일 없음, 건너뜀: {path})")
        return []
    except Exception as e:
        log(f"  [WARN] {path} 읽기 실패: {e}")
        return []

    if skipped_no_key:
        log(f"  - 공고번호 누락으로 제외: {skipped_no_key}건")
    return items


def find_target_csvs(target_date: str) -> list:
    """대상 날짜(YYYYMMDD)의 공사/물품 CSV 경로 목록"""
    patterns = [
        os.path.join(GONGO_DIR, f"공사_{target_date}.csv"),
        os.path.join(GONGO_DIR, f"물품_{target_date}.csv"),
    ]
    return [p for p in patterns if os.path.exists(p)]


def upload_batch(items: list) -> bool:
    if not API_BASE or not API_KEY:
        log("[ERROR] BID_API_BASE / BID_API_KEY 환경변수가 설정되지 않았습니다.")
        return False

    url = f"{API_BASE}/api/bids/import"
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
    }

    try:
        resp = requests.post(url, headers=headers, data=json.dumps({"items": items}), timeout=30)
    except requests.RequestException as e:
        log(f"  [ERROR] 요청 실패: {e}")
        return False

    if resp.status_code != 200:
        log(f"  [ERROR] 업로드 실패 (HTTP {resp.status_code}): {resp.text[:300]}")
        return False

    return True


def chunked(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


def main():
    parser = argparse.ArgumentParser(description="gongo CSV -> Cloudflare bids 동기화")
    parser.add_argument(
        "--date", default=None,
        help="대상 날짜(YYYYMMDD). 미지정 시 오늘 날짜. 예: --date 20260814"
    )
    parser.add_argument(
        "--days-back", type=int, default=0,
        help="오늘 기준 며칠 전 데이터까지 함께 처리할지 (기본 0 = 오늘만)"
    )
    args = parser.parse_args()

    dates = []
    if args.date:
        dates = [args.date]
    else:
        base = datetime.now()
        for i in range(args.days_back, -1, -1):
            dates.append((base - timedelta(days=i)).strftime("%Y%m%d"))

    log(f"동기화 시작 - 대상 날짜: {dates}")
    log(f"GONGO_DIR={GONGO_DIR}, BID_API_BASE={API_BASE or '(미설정)'}")

    total_matched = 0
    total_uploaded = 0
    total_failed_batches = 0

    for date_str in dates:
        csv_paths = find_target_csvs(date_str)
        if not csv_paths:
            log(f"- {date_str}: 대상 CSV 없음 (아직 수집 전이거나 날짜 오류)")
            continue

        for path in csv_paths:
            log(f"- 처리 중: {path}")
            items = read_and_filter_csv(path)
            log(f"  -> 필터 통과: {len(items)}건 (기계·소방설비 + 전국/충북/세종)")
            total_matched += len(items)

            if not items:
                continue

            for batch in chunked(items, BATCH_SIZE):
                ok = upload_batch(batch)
                if ok:
                    total_uploaded += len(batch)
                    log(f"  -> 업로드 완료: {len(batch)}건")
                else:
                    total_failed_batches += 1

    log(f"동기화 종료 - 필터통과 {total_matched}건 / 업로드성공 {total_uploaded}건 / 실패배치 {total_failed_batches}개")

    if total_failed_batches > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
