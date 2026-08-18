-- "기초금액" 라벨 대신 "추정금액" 라벨을 쓴 수동 입력 이벤트의 base_amount 백필
-- extractField()에 '추정금액' 폴백을 추가한 것과 동일한 결과를 기존 데이터에 반영
UPDATE gcal_bids SET base_amount = '46,200,000' WHERE event_id = '7s9risvq3j7o1dfq86793980gq';
UPDATE gcal_bids SET base_amount = '8,609,497,000원' WHERE event_id = '7ijnma20h5m8cseetj74n8cod6';
UPDATE gcal_bids SET base_amount = '3,222,681,000원' WHERE event_id = '07opevfojn8pu7b3suo666k8g1';
