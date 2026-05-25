# Backend 개발 노트 (Backend)

## 1. 최근 수정 사항 (2026-05-25)
- **Live Server 무한 루프(EBUSY 에러) 버그 해결:** `server.js`의 파일 시스템 쓰기(`fs.writeFileSync`) 도중 발생하는 `EBUSY` 에러 우회를 위한 동기 블로킹 `while` 루프가 Node.js 메인 스레드를 프리징 시키던 치명적 결함을 발견. 이를 해결하기 위해 `DATA_DIR`를 `os.tmpdir()`로 이동하여 파일 감지를 우회하고, 데이터 저장 로직을 비동기(`async/await`) + `setTimeout` 방식으로 변경 완료.
- **프론트엔드 API 프록시 완전 연결:** 브라우저에서 직접 외부 API를 호출하던 기존 구조(`Trainning.html` 등)를 탈피하고, CORS 문제와 키 노출을 방지하기 위해 `returnfit-api-config.js`를 수정. 프론트엔드의 모든 요청이 백엔드의 `/api/*` 경로를 통하도록 보장.
- **AI 맞춤 추천 파이프라인 연동:** `plan.md`의 기획을 기반으로, `server.js`의 `/api/recommendations` 엔드포인트 내 OpenAI 프롬프트에 `readinessScore` (구직 준비도)와 `phq9Score` (우울감) 필터를 강력하게 연동함. 

## 2. 사용 기술 및 구조
- **환경변수:** `dotenv` (안전한 서버 사이드 API Key 관리)
- **비즈니스 로직:** `Express.js` (라우팅 및 프록시), `OpenAI API` (맞춤형 추천 사유 및 랭킹 정렬)
- **DB 스토리지:** `fs` 기반의 로컬 JSON 파일 시스템 (충돌 방지를 위해 OS Temp 디렉터리 사용)

## 3. 중요 유지보수 사항
- 프론트엔드 코드 내에서는 어떠한 API Key도 노출되지 않아야 하며, 추가적인 외부 서비스 연동이 필요할 경우 반드시 `server.js` 내부에 새로운 라우트를 생성하여 프록시 형태로 연동할 것.
- AI 추천 로직이 수정되어야 할 경우 `server.js`의 `messages[0].content` 시스템 프롬프트를 우선적으로 조정할 것.
