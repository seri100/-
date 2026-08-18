-- '/' 구분자 날짜를 '-'로 통일하여 date_from/date_to 문자열 비교 필터 누락 버그 수정
-- (예: 합강중학교 신축 기계설비공사 - bid_deadline '2026/08/28 10:00:00' -> '2026-08-28 10:00:00')
UPDATE gcal_bids SET bid_deadline = '2026-07-15 14:00:00 ~ 2026-07-20 11:00:00' WHERE event_id = 'bida02ce989a95452c01bfd71c16b1cdacc5e11153f';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-21 10:00' WHERE event_id = '0keabs6gkthhdso6ilhq44sppq';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-20 10:00' WHERE event_id = '11f7a48fmrmmho4qb0k9lf6o1d';
UPDATE gcal_bids SET bid_deadline = '2026-07-06 15 :00 ~ 2026-07-22 10:00' WHERE event_id = '4muknvu03m98l2ljsb0p9uls61';
UPDATE gcal_bids SET bid_deadline = '2026-07-28 10:00:00 ~ㅠ2026-07-31 12:00:00' WHERE event_id = 'bid44efe34cf872c120d5619a045f7c9f1786822164';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-31 10:00' WHERE event_id = '338tl93ndnqe9os62ntl91tl5t';
UPDATE gcal_bids SET bid_deadline = '2026-08-03 15:00~ 2026-08-11 10:00' WHERE event_id = '6ptpb41hd5474pd84qtmf9vboc';
UPDATE gcal_bids SET bid_deadline = '2026-08-19 10:00    공동도급지역 : 전북,  광주전남    공동도급비율 : 30%      기초금액 :  1,158,524,957원    공고번호 :  Y26-S111-000' WHERE event_id = '0cn933grm5vt7pqtip77khshk9';
UPDATE gcal_bids SET bid_deadline = '2026-08-19 10:00공동도급지역 : 전북,  광주전남공동도급비율 : 30%기초금액 :  1,158,524,957원공고번호 :  Y26-S111-000' WHERE event_id = '303ktl86nmh6c4mdo356ij3gdk';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-18 10:00' WHERE event_id = '3dmj768ngolmftuinqvgaqkr2l';
UPDATE gcal_bids SET bid_deadline = '2026-08-12 13:30 ~ 2026-08-19 10:00    공동도급지역 : 전북,  광주전남    공동도급비율 : 30%' WHERE event_id = '48gjo8407vruinvalnvvoffgbl';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-18 10:00' WHERE event_id = '6v0u3s9hh0vr19jsf8vr9no8pc';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-24 10:00' WHERE event_id = '1le0utu7esubsidks5v0siiv6q';
UPDATE gcal_bids SET bid_deadline = '2026-08-28 10:00:00' WHERE event_id = '07opevfojn8pu7b3suo666k8g1';
UPDATE gcal_bids SET bid_open_recv_date = '2026-09-01 10:00' WHERE event_id = '5l4b2ke2023t7nhhdcvmvr96li';
