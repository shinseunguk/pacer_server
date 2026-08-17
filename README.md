# pacer_server

> 페이서(Pacer) — 면접의 페이스를 잡아주는 AI 코치. NestJS 백엔드.

면접 세션·질문·답변·평가 데이터를 관리하고, LLM을 프록시(프롬프트 구성·SSE 스트리밍·가드레일·비용 통제)하는 서버입니다.

## 기술 스택

| 영역 | 스택 |
|------|------|
| 프레임워크 | NestJS 11 / TypeScript / Node 24 |
| DB | PostgreSQL + TypeORM (마이그레이션으로만 스키마 관리) |
| 캐시 | Redis (일일 질문 카운터 · 질문 플랜 · refresh 토큰) |
| 인증 | 소셜 로그인(카카오·애플) + JWT(access/refresh 회전) |
| 보안 | helmet · CORS 화이트리스트 · rate limit(@nestjs/throttler) |
| AI | LLM 프록시 (API 키는 서버에서만 관리) — **현재 스텁 엔진** |
| 배포 | Docker + Nginx + EC2 |

> 모바일 앱은 별도 저장소 `pacer_app` (Flutter) 를 사용합니다. API 계약은 `docs/Pacer_API명세_v1.md`.

## 로컬 실행

```bash
cp .env.example .env
docker compose up -d          # PostgreSQL(5434) · Redis(6381)
npm install
npm run migration:run
npm run db:seed               # 직무 카테고리 시드 (멱등)
npm run start:dev             # http://localhost:3000/v1, 문서 /docs
```

## 검증

```bash
npm run lint      # ESLint (경고 0 유지)
npm run build     # 타입·컴파일
npm test          # 단위 테스트
npm run test:e2e  # e2e (PostgreSQL·Redis 필요)
```

CI(`.github/workflows/ci.yml`)는 push·PR마다 lint → build → 단위 테스트 → (PostgreSQL·Redis 서비스 컨테이너로) e2e
를 돌리고, 운영 Docker 이미지 빌드까지 확인합니다.

## 배포 (Docker)

```bash
# 이미지 빌드 + 스택 기동 (api · postgres · redis · nginx)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 스키마 반영 (컴파일된 data-source 사용)
docker compose -f docker-compose.prod.yml exec api npm run migration:run:prod
```

- Nginx 설정은 `deploy/nginx.conf` — 면접 응답이 SSE라 `proxy_buffering off` + 타임아웃 상향이 걸려 있습니다.
- Nginx 뒤에 둘 때는 `TRUST_PROXY=true` 로 두어야 rate limit이 실제 클라이언트 IP를 봅니다.
- 운영(`NODE_ENV=production`)에서는 Swagger(`/docs`)를 노출하지 않습니다.

## 구현 현황 (Phase A)

| 영역 | 상태 |
|------|------|
| 스키마·마이그레이션·직무 시드 | 완료 |
| 인증(카카오·애플 검증 + JWT 회전) | 완료 (앱 dev 빌드는 목 검증기 사용) |
| 사용자 온보딩·프로필·탈퇴 | 완료 |
| 면접 세션·메시지 API (생성/답변 SSE/스킵/일시정지/이어하기/종료/재열람/히스토리) | 완료 |
| 직무별 가중치 평가 + 서버 재계산 | 완료 |
| 약관·개인정보 처리방침 제공 (`/legal`) | 완료 (법률 검토 전 초안) |
| 보안(helmet·CORS·rate limit) · 개인정보 파기 배치 | 완료 |
| **LLM 파이프라인** | **미구현** — `src/llm`의 스텁 엔진이 결정적 템플릿 응답 |
| 성장 추이 · 구독/IAP | 미구현 (P1 / Phase B) |

## 개인정보 파기

`PrivacyPurgeService`가 매일 04:00(KST)에 실행됩니다.

- 탈퇴(soft delete) 계정 → 하드 삭제 (세션·메시지·평가·동의·사용량은 FK CASCADE)
- 보관 기간(`SENSITIVE_RETENTION_DAYS`, 기본 90일)이 지난 세션의 공고 원문·자기소개·이력서 참조 → NULL
