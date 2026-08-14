# pacer_server

> 페이서(Pacer) — 면접의 페이스를 잡아주는 AI 코치. NestJS 백엔드.

면접 세션·질문·답변·평가 데이터를 관리하고, LLM을 프록시(프롬프트 구성·SSE 스트리밍·가드레일·비용 통제)하는 서버입니다.

## 기술 스택

| 영역 | 스택 |
|------|------|
| 프레임워크 | NestJS / TypeScript |
| DB | PostgreSQL (관계형 데이터) |
| 캐시 | Redis (질문 카운터 · 세션 · LLM 응답 캐시) |
| AI | LLM 프록시 (API 키는 서버에서만 관리) |
| 배포 | Docker + EC2 |

> 모바일 앱은 별도 저장소 `pacer_app` (Flutter) 를 사용합니다.

> 아직 스캐폴딩 전입니다. `nest new` 로 프로젝트를 생성할 예정입니다.
