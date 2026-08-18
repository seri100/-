-- 라벨 없는 날짜범위(입찰서접수개시일시/입찰마감일시 라벨 미기재) 이벤트의
-- bid_open_recv_date/bid_deadline이 NULL로 남아있던 문제 백필
-- (extractDateRangeFallback 정규식이 '/' 구분자를 인식하지 못하던 버그 수정 후 재적용)
-- 예: 운호중 급식시설 현대화사업 기계/소방공사 - 라즈베리파이 CSV에는 있으나 구글캘린더 대시보드엔 누락되던 건
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-15 09:30', bid_deadline = '2026-07-21 10:00' WHERE event_id = '5g0g1pdh5866u9ckpsq4ihvqp2';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-15 14:00:00' WHERE event_id = 'bida02ce989a95452c01bfd71c16b1cdacc5e11153f';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-22 18:00', bid_deadline = '2026-09-01 10:40:00' WHERE event_id = '382ftj5gnmaimjh8ia289cg7em';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-06 15:00' WHERE event_id = '4muknvu03m98l2ljsb0p9uls61';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-20 10:00:00', bid_deadline = '2026-07-22 10:00:00' WHERE event_id = '5ktndduio5kn6mh30odb4ei6vb';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-20 10:00:00', bid_deadline = '2026-07-23 12:00:00' WHERE event_id = '4c9hpt8ctv9cadr48sebfogg9h';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-21 10:00', bid_deadline = '2026-07-23 10:00' WHERE event_id = '64b99oi8gmbeq2jar9fb10gbg9';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-23 10:00:00', bid_deadline = '2026-07-27 10:00:00' WHERE event_id = '4qbel7i6nq8r7ps2ekcppkp872';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-24 10:00:00', bid_deadline = '2026-07-28 10:00:00' WHERE event_id = '3ph6ffami9av31uf7c6j0ak4iv';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-24 10:00:00', bid_deadline = '2026-07-28 10:00:00' WHERE event_id = '4ur9jk9s5mpq9gu52u7p98aukm';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-22 09:00', bid_deadline = '2026-07-28 10:00' WHERE event_id = '64hjb96qr2jh5pq1scilgtg7fc';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-27 16:00:00', bid_deadline = '2026-07-29 16:00:00' WHERE event_id = '18svo5p923bs368a9ijk58185o';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-24 10:00:00', bid_deadline = '2026-07-29 10:00:00' WHERE event_id = '4kssenmp242ninu9qg4rct2ja1';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-23 23:00:00', bid_deadline = '2026-07-29 10:00:00' WHERE event_id = '7qukro6c4tn8l5ftbit4qcckd8';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-23 09:30:00', bid_deadline = '2026-07-29 10:30:00' WHERE event_id = '7s9risvq3j7o1dfq86793980gq';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-28 10:00', bid_deadline = '2026-07-31 12:00' WHERE event_id = '4q5uich1d9g4v2u87deh0dij5t';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-27 09:00:00', bid_deadline = '2026-08-03 10:00:00' WHERE event_id = '5n5kq5oq0p4vbano43ac3g5hoq';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-29 09:00', bid_deadline = '2026-08-04 10:00' WHERE event_id = '126gjftjnnqqsrhdtca0e7sl2l';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-30 15:00:00', bid_deadline = '2026-08-04 15:00:00' WHERE event_id = '3174o5o5k14fqoijvohbr9ud81';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-28 09:00', bid_deadline = '2026-08-05 10:00' WHERE event_id = '4df7d3cnoq61s8ruac4svqilb7';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-28 00:00', bid_deadline = '2026-08-05 14:00' WHERE event_id = '5eclrk18l617pirupp3ibfnlpe';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-06 10:00', bid_deadline = '2026-08-11 10:00' WHERE event_id = '0foa8re4qbflu62u4dgej3pi15';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-03 15:00' WHERE event_id = '6ptpb41hd5474pd84qtmf9vboc';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-27 16:00', bid_deadline = '2026-08-12 10:00' WHERE event_id = '5k7jkict7psosstns2o7gsnvks';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-11 10:00:00', bid_deadline = '2026-08-13 10:00:00' WHERE event_id = '24pst9p1ejt61ng1k15qlo3ka0';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-11 14:00:00', bid_deadline = '2026-08-13 14:00:00' WHERE event_id = '5tnpjbuvlalvft4mv7qmjkkqp2';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-11 14:00:00', bid_deadline = '2026-08-13 14:00:00' WHERE event_id = '7oufrutmd526edbjs5og314ojk';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-13 10:00:00', bid_deadline = '2026-08-18 10:00:00' WHERE event_id = '0ftpjolpmlgnovki8ko8d2khj0';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-12 13:30' WHERE event_id = '48gjo8407vruinvalnvvoffgbl';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-12 14:00:00', bid_deadline = '2026-08-19 12:00:00' WHERE event_id = '0l6ddp40vvlg8uakenlpimqolj';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-19 10:00', bid_deadline = '2026-08-20 10:00' WHERE event_id = '38b8jlrmvubgq97bimrq4lnq8h';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-12 11:00:00', bid_deadline = '2026-08-19 10:00:00' WHERE event_id = '42ulc8860gsa6m2gdu98f5fhj7';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-13 10:00:00', bid_deadline = '2026-08-19 12:00:00' WHERE event_id = '4kka7cds4v1l0n9v2qocjc5g81';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-14 09:00', bid_deadline = '2026-08-20 10:30' WHERE event_id = '672n41fp2e1ufkahdf5ukb7rf2';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-11 14:00:00', bid_deadline = '2026-08-20 14:00:00' WHERE event_id = '271itd7rkdc4m0et656174h4ne';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-13 09:00', bid_deadline = '2026-08-20 10:30' WHERE event_id = '5o9668u5fh91lt4ms59t1l564d';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-18 10:00', bid_deadline = '2026-08-21 12:00' WHERE event_id = '30enk4ndq2ulk79dhh0j0a1641';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-14 09:00', bid_deadline = '2026-08-21 10:00' WHERE event_id = '3d0mukvu696ror92bolrvlujhp';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-13 11:00:00', bid_deadline = '2026-08-24 10:00:00' WHERE event_id = '1o3phc8r11a462sib62p2adtpb';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-21 10:00', bid_deadline = '2026-08-25 10:00' WHERE event_id = '24n8hjcetip3rgj128fsprchn6';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-06 15:00', bid_deadline = '2026-08-25 14:00' WHERE event_id = '4arkkqnc5hpjghcgod1kd44h3u';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-26 00:00:00' WHERE event_id = '07opevfojn8pu7b3suo666k8g1';
UPDATE gcal_bids SET bid_open_recv_date = '2026-08-18 11:00:00', bid_deadline = '2026-08-26 10:00:00' WHERE event_id = '3rqefnfhv3vbpn1vk5up25oaem';
UPDATE gcal_bids SET bid_open_recv_date = '2026-07-22 18:00', bid_deadline = '2026-09-01 10:40:00' WHERE event_id = '2muhkgg71a59vukomnqu26e8qg';
