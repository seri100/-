-- 테스트용 초기 데이터
INSERT OR IGNORE INTO tasks (id, title, description, completed) VALUES
  (1, 'Hono 프로젝트 설정', 'Cloudflare Pages 템플릿으로 프로젝트 생성', 1),
  (2, 'D1 데이터베이스 연동', 'tasks 테이블 마이그레이션 적용', 1),
  (3, 'REST API 구현', 'CRUD 엔드포인트 작성', 0),
  (4, 'Cloudflare Pages 배포', '프로덕션 환경에 배포하기', 0);
