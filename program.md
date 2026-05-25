# 프로그램 아키텍처 및 디자인 (Program)

## 1. 프로젝트 구조 (파일 층위)
- **Root (`/`)**
  - `server.js`: 백엔드 메인 엔트리 포인트 (Express 서버 구성 및 API 엔드포인트 제공)
  - `.env`: API 키 및 환경변수 설정 파일 (git 등 버전 관리에서 제외)
  - `package.json`: 의존성 모듈(`express`, `axios`, `dotenv`, `openai`, `cors` 등) 및 스크립트 관리
  - 문서 파일 (`program.md`, `backend.md`, `plan.md`, `analysis.md` 등)
- **Frontend (`/public`)**
  - `Main.html`, `Ai_Agent.html`, `Job_Posting.html` 등: 프론트엔드 UI 화면 구성 요소
  - `returnfit-api-config.js`: 프론트엔드용 외부 API 엔드포인트 주소 구성
- **Data (`/data`)**
  - `profiles.json`, `basic-info.json` 등: 파일 기반의 간단한 JSON DB 스토리지

## 2. 주요 아키텍처 패턴
- **모놀리식 & 파일 기반 스토리지 (Monolithic & File-based DB):** 빠르고 가벼운 프로토타입/MVP 목적을 위해 파일 읽기/쓰기를 DB 대용으로 사용 (`fs` 모듈).
- **Proxy 패턴:** 브라우저 측 CORS 이슈 우려와 보안(API 키 노출 방지)을 위해 클라이언트는 내부 `/api/*` 경로를 호출하고 `server.js`에서 외부 API로 재요청하는 프록시 역할을 수행.

- **점수 연산 서버 분리:** 프론트엔드의 화면 렌더링 역할과 백엔드의 비즈니스 로직(점수 연산, 판정) 역할을 명확하게 분리하여 유지보수성과 확장성 확보.

## 3. 최근 작업 반영 사항
- **환경변수 파이프라인 개편:** `dotenv`를 도입하여 API 키 보안 강화. 클라이언트가 API 키에 직접 접근하지 않고, `server.js` 프록시 경로(`/api/*`)를 경유하여 데이터를 호출하도록 변경.
- **로컬 스토리지 무한 새로고침(Live Server) 해결:** VSCode Live Server 사용 시 파일 변경 감지로 인한 무한 새로고침 루프를 방지하기 위해 `DATA_DIR`를 작업 폴더가 아닌 OS의 임시 폴더(`os.tmpdir()`)로 이동.
- **동기화 로직 비동기(Async) 처리 전환:** 파일 쓰기(`writeJsonDb`) 시 발생하던 `EBUSY` 에러 우회를 위해 존재하던 동기적 `while` 루프(CPU 프리징 유발)를 제거하고 비동기 `setTimeout`으로 전면 교체.
- **자가점검 기반 AI 추천 로직 통합:** `plan.md`에 정의된 사용자의 구직 준비도(Readiness) 및 우울감(PHQ-9) 점수 기준을 `server.js`의 `/api/recommendations` 내 OpenAI 프롬프트로 완벽히 통합하여 구현 완료.
