# 페이서 (Pacer) — 기술 아키텍처 v1

> 상위 문서: 기획서 / 기능 명세 / 화면 정의서 / ERD / API 명세 / AI 프롬프트 v1
> 구성: Flutter 앱 + NestJS 서버 + PostgreSQL/Redis + LLM(프록시) + 소셜 인증 + IAP

---

## 1. 시스템 개요

- **클라이언트**: Flutter 앱(iOS/Android) + iOS 네이티브 모듈(위젯·Live Activity·푸시)
- **서버**: NestJS(TypeScript) — 인증·면접·구독·**LLM 프록시**의 허브
- **데이터**: PostgreSQL(영속) + Redis(한도 카운터·캐시)
- **외부**: 소셜 OAuth(카카오·애플·구글), LLM API, 인앱결제 검증(애플·구글)
- **인프라**: Docker + EC2 + Nginx (기존 자산 재활용)

핵심 원칙: **앱은 LLM을 직접 호출하지 않는다.** 모든 LLM 호출은 서버가 프록시(키 보호·프롬프트·가드레일·비용 통제 일원화).

---

## 2. Flutter 앱 구조

Clean Architecture + Riverpod(또는 Bloc) + get_it(DI).

```
lib/
├─ core/            # 공통(네트워크, 토큰 저장, 에러, 테마)
├─ features/
│  ├─ auth/         # 소셜 로그인, 온보딩
│  ├─ interview/    # 준비·진행(SSE)·리포트
│  ├─ history/      # 목록·대화 재열람
│  ├─ growth/       # 성장 추이
│  └─ subscription/ # 페이월·구독
└─ native/          # 플랫폼 채널 (위젯·Live Activity·푸시)
```

- **레이어**: presentation(위젯/상태) → domain(usecase/entity) → data(repository/API)
- **상태관리**: Riverpod — 세션 진행, 스트리밍 수신 상태 관리
- **네트워크**: Dio + 인터셉터(토큰 갱신), SSE 클라이언트(면접 스트리밍)
- **보안 저장**: 토큰은 flutter_secure_storage
- **네이티브 모듈(플랫폼 채널)**: 홈 위젯(잔여 한도·스트릭), Live Activity(진행률), 로컬 푸시(리마인더) — 포트폴리오 가치 겸용

---

## 3. NestJS 서버 구조

모듈 단위 (기능 명세 도메인과 1:1).

```
src/
├─ auth/           # 소셜 토큰 검증, JWT 발급/갱신
├─ users/          # 온보딩, 프로필, 탈퇴(파기)
├─ jobs/           # 직무 카테고리
├─ interviews/     # 세션·메시지·평가 + LLM 프록시(SSE)
├─ subscriptions/  # IAP 영수증 검증·복원
├─ usage/          # 한도 카운트(Redis)·자정 리셋(cron)
├─ llm/            # LLM 클라이언트·프롬프트·스키마 검증
└─ common/         # 가드·인터셉터·예외 필터·zod 검증
```

- **LLM 모듈**: 프롬프트 조립 + LLM 호출 + 출력 스키마 검증(zod) + 스트리밍 중계. 프롬프트는 버전 관리.
- **스케줄러**: `@nestjs/schedule` cron으로 일 마감 집계·정리
- **검증**: class-validator(요청) + zod(LLM 출력)
- **가드레일 후필터**: LLM 출력 금지어·패턴 서버측 2차 필터

---

## 4. 인증 흐름 (소셜 로그인)

```
1. 앱 → 소셜 SDK 로그인 → idToken 획득
2. 앱 → POST /auth/login/{provider} (idToken)
3. 서버 → 소셜 공급자에 idToken 검증
4. 서버 → 사용자 조회/생성 → JWT(access·refresh) 발급
5. 앱 → 이후 요청에 Bearer accessToken
6. 만료 시 → POST /auth/refresh
```

- 애플: 최초 응답의 name/email을 3단계에서 즉시 저장(재취득 불가 대비)
- iOS: Sign in with Apple 필수 노출(심사 4.8)

---

## 5. 면접 LLM 프록시 흐름 (SSE)

```
앱 → POST /interviews/{id}/answer (답변)
서버:
  ├─ Redis 한도 확인 → 소진 시 402 + 페이월(스트림 미개시)
  ├─ 답변 저장(interview_messages)
  ├─ 꼬리질문/다음질문 프롬프트 조립 → LLM 스트리밍 호출
  ├─ SSE로 delta 중계 (feedback → message.delta → message.done)
  ├─ 기본 질문 진행 시 Redis 카운트 증가(꼬리질문 제외)
  └─ 완료 발화 저장
앱 → 스트림 수신하며 채팅 UI 렌더
```

- 최종 평가(`/complete`)도 동일 프록시 패턴, 스키마 검증 후 저장

---

## 6. 데이터 계층

- **PostgreSQL**: users·sessions·messages·evaluations·subscriptions 등(ERD 참조)
- **Redis**:
  - `usage:{userId}:{yyyymmdd}` — 하루 질문 카운터, 자정(KST) TTL
  - `session:{id}` — 진행 캐시
  - `llm:{hash}` — 응답 캐시(비용 절감)
- 접속: DBeaver/SSH 터널(운영), 커넥션 풀

---

## 7. 인프라 / 배포

- **컨테이너**: Docker(앱 서버·PG·Redis·Nginx)
- **호스팅**: EC2 (기존 incross-cafe 구성 재활용 가능)
- **리버스 프록시**: Nginx(TLS 종단, SSE 프록시 버퍼링 off 설정 필요)
- **CI/CD**: GitLab CI / Fastlane(앱 배포)
- **모니터링**: 크래시(Sentry) + 서버 헬스체크

> SSE 사용 시 Nginx `proxy_buffering off`, 타임아웃 상향 필요.

---

## 8. 보안 · 개인정보

- 토큰: 앱은 secure storage, 서버는 JWT 서명키 관리
- LLM 키: 서버 환경변수, 앱 미노출(프록시 필수 이유)
- 민감정보(공고·자소서·이력서·답변): 동의 후 전송, 탈퇴 시 파기 배치
- 리소스 소유권 검증(타 사용자 데이터 접근 차단)
- 가드레일 이중화(프롬프트 + 서버 후필터)

---

## 9. 산출물 맵 (문서 세트)

1. 서비스 기획서
2. 기능 명세 / 유저 스토리
3. 화면 정의서
4. 데이터 모델 / ERD
5. API 명세
6. AI 프롬프트 설계
7. 기술 아키텍처 (본 문서)

→ 다음: 8단계 MVP 범위 확정(P0 컷) → 9단계 구현(백엔드→Flutter) → 10단계 QA·배포
