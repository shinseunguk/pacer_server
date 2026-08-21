# pacer_server — NestJS 서버 가이드

> 페이서 백엔드. 공통 워크플로우는 상위 `Pacer/CLAUDE.md`를 따른다.
> 클라이언트는 별도 레포 `pacer_app`(Flutter).

## 설계 문서 (docs/)
구현 전 반드시 참조한다. 이 중 **ERD·API 명세는 "계약"**으로 취급한다(임의 변경 금지, 변경이 필요하면 문서를 먼저 갱신).
- `docs/Pacer_기획서_v1.md`
- `docs/Pacer_데이터모델_ERD_v1.md`
- `docs/Pacer_API명세_v1.md`
- `docs/Pacer_AI프롬프트설계_v1.md`
- `docs/Pacer_기술아키텍처_v1.md`
- `docs/Pacer_MVP범위_v1.md`

## 작업 가드레일 (Phase A)
- **범위**: `docs/Pacer_MVP범위_v1.md`의 **Phase A(클로즈드 베타)**를 구현한다.
  - **예외: 결제·이용권은 앞당겨 구현했다** (ADR 0007). LLM 파이프라인보다 게이트가
    먼저 있어야 무제한 무료 호출이 열리지 않는다.
  - 스토어 검증은 **포트 + 스텁**까지만 되어 있다. 애플·구글 어댑터는 개발자 계정 확보 후.
- **마일스톤(한 번에 하나씩)**:
  1. 백엔드 코어: 스키마 → 인증(카카오/애플) → 세션·메시지 API
  2. LLM 파이프라인: 질문 생성 → 꼬리질문 → 최종 평가(직무 가중치) + 출력 스키마 검증 ✅
     - `LLM_API_KEY`가 있으면 Anthropic 어댑터, 없으면 스텁이 주입된다 (ADR 0003)
     - e2e는 키를 비워 스텁으로 돈다 (`test/setup-e2e.ts`) — 실호출은 과금된다
  3. (앱) 온보딩 → 준비/설정 → 진행(SSE) → 리포트 → 히스토리
  4. 클로즈드 베타 배포 → 면접·평가 품질 검증
- **계약 우선**: ERD·API 명세를 계약으로 취급. 임의 변경 금지, 필요 시 **문서 갱신 제안 → 마이그레이션**.
- **LLM 출력 검증**: 항상 지정 JSON 스키마로 받고 **서버에서 zod로 검증**, 파싱 실패 시 1회 재요청.
- **plan 먼저**: 큰 작업은 plan을 제시·승인 후 진행한다.
- **시크릿**: LLM API 키·시크릿은 서버에만. 클라이언트 노출 금지.
- **모듈 = 도메인 단위**: `auth / users / jobs / interviews / subscriptions / usage / llm`.

## 스택
- NestJS 11 / Node 24 / TypeScript
- DB: PostgreSQL · 캐시: Redis · 배포: Docker + EC2
- LLM은 **서버가 프록시**한다 (프롬프트 구성·SSE 스트리밍·가드레일·비용 통제).

## 구조 (기능 단위 모듈)
```
src/
├── main.ts
├── app.module.ts
└── <feature>/
    ├── <feature>.module.ts
    ├── <feature>.controller.ts
    ├── <feature>.service.ts
    ├── dto/                # Request/Response DTO (class-validator)
    └── entities/           # DB 엔티티
```
- 컨트롤러는 얇게, 비즈니스 로직은 서비스로. 외부 연동은 provider로 주입(DI).
- DTO는 `class-validator`/`class-transformer`로 검증.

## 컨벤션
- 코드·주석은 영어. 사용자 노출 메시지·에러 문구는 한국어.
- 깊은 중첩보다 early return. 함수는 짧게, 단일 책임.

## 검증 명령 (테스트 단계에서 반드시 실행)
```bash
npm run lint     # ESLint — 경고/에러 0 유지
npm run build    # 타입·컴파일 검증
npm run test     # 단위 테스트
npm run test:e2e # (엔드포인트 추가 시) e2e
```
- 새 로직에는 테스트를 함께 추가한다 (서비스 로직 우선).

## 보안 주의 (민감정보)
- 이력서·자소서·면접 답변은 **민감 개인정보**. 로그에 원문 출력 금지.
- API 키·시크릿·DB 접속정보는 `.env`로만 관리(`.gitignore` 적용됨). 예시는 `.env.example`.
- API 추가 시 `@nestjs/swagger`로 문서화 → 추후 앱 클라이언트 생성 기반.

---

## 환경설정 + API 규약
- `@nestjs/config` — `ConfigModule.forRoot({ isGlobal: true, validationSchema })`로 부팅 시 env 검증.
- `.env.example` 키(예): `PORT`, `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `LLM_API_KEY`, `KAKAO_*` / `APPLE_*` / `GOOGLE_*`.
- **API 버전 prefix**: `/api/v1`.
- **응답 포맷 표준화**: 성공 `{ data }`, 에러 `{ statusCode, code, message }` — 전역 `ExceptionFilter` + `ResponseInterceptor`.
- **페이지네이션**: `?page=&size=` → `{ items, total, page, size }`.
- 입력 검증은 전역 `ValidationPipe`(whitelist, transform).

## 인증 (JWT·소셜)
- 소셜 로그인: 앱이 받은 provider 토큰을 **서버가 검증**한다(카카오/구글 tokeninfo, 애플 JWKS 서명 검증).
- **애플**: 최초 1회만 제공되는 이름·이메일을 **즉시 DB 저장**. 이메일은 `nullable`(Private Relay/거부 대비).
- **JWT**: access(짧게) / refresh(길게, 회전 rotation). `JwtAuthGuard` + `@Public()` 데코레이터.
- 토큰 저장은 앱의 secure storage 책임. 서버는 refresh 토큰 해시만 보관.

## DB (ORM)
- **TypeORM** 사용(권장) — `@nestjs/typeorm` 공식 통합, 엔티티 데코레이터가 Nest 스타일과 정합.
  - 대안: Prisma(타입 안전·DX 우수). 파이프라인이 복잡해지면 재검토.
- **마이그레이션**: 운영은 `synchronize: false`. 스키마 변경은 CLI 마이그레이션 파일로 관리하고 **커밋에 포함**.
- 핵심 엔티티(예): `users` / `interview_session` / `question` / `answer` / `evaluation`.

## LLM 프록시 + 보안
- **프롬프트 버전관리**: 프롬프트·평가 루브릭(직무별 가중치)을 코드/상수로 버전 관리. "알아서"에 맡기지 않는다.
- **스트리밍**: LLM 응답을 **SSE**로 앱에 중계. 취소·타임아웃·재시도 처리.
- **가드레일**: 불법·차별 질문(나이·결혼·출신 등) 생성 방지 필터 + 사용자 입력 모더레이션.
- **비용/사용량**: 토큰 사용량 로깅. 하루 질문 카운터는 **Redis**로(자정 KST TTL 리셋, 꼬리질문 제외).
- **보안**: `helmet`, CORS 화이트리스트, rate limiting(`@nestjs/throttler`).
- **개인정보**: 이력서·답변 원문 **로그 출력 금지**, 분석 후 미저장 옵션 검토, 회원 탈퇴 시 지체 없이 파기. 외부 LLM 사용 시 **처리위탁·국외이전 고지**.

---

## 커밋 규칙
전역 `commit-convention` + 상위 `Pacer/CLAUDE.md` 워크플로우를 따른다.
- Conventional Commits(`<타입>[범위]: <설명>`), 꼬리말 `closed #<이슈번호>`.
- 브랜치: `main`에서 `<타입>/#<이슈번호>-<슬러그>` 분기(`main` 직접 커밋 금지).
- 커밋 메시지에 `Co-Authored-By`·AI 서명 금지. author `shinseunguk <krdut1@gmail.com>`.
- 커밋/푸시/PR은 사용자가 요청할 때(개발·테스트까지가 자동 범위).
