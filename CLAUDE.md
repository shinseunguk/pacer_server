# pacer_server — NestJS 서버 가이드

> 페이서 백엔드. 공통 워크플로우는 상위 `Pacer/CLAUDE.md`를 따른다.
> 클라이언트는 별도 레포 `pacer_app`(Flutter).

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
