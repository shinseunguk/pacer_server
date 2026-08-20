# 페이서 (Pacer) — REST API 명세 v1

> 상위 문서: 기획서 / 기능 명세 / 화면 정의서 / 데이터 모델(ERD) v1
> 서버: NestJS · REST · JSON
> 다음 단계: AI 프롬프트 설계

---

## 1. 공통 규약

- **Base URL**: `https://api.pacer.app/v1`
- **인증**: `Authorization: Bearer <accessToken>` (로그인·직무 조회 제외 전 구간 필요)
- **콘텐츠 타입**: `application/json` (스트리밍만 `text/event-stream`)
- **날짜**: ISO 8601 (KST 기준 로직은 서버 처리)

### 에러 응답 포맷
```json
{ "error": { "code": "QUOTA_EXCEEDED", "message": "무료 한도를 모두 사용했어요." } }
```

### 공통 상태 코드
| 코드 | 의미 |
|------|------|
| 400 | 잘못된 요청 |
| 401 | 인증 필요/만료 |
| 402 | 결제 필요 (한도 소진 → 페이월) |
| 403 | 권한 없음 |
| 404 | 리소스 없음 |
| 409 | 충돌(중복 등) |
| 422 | 유효성 실패 |
| 429 | 과도한 요청 |
| 500 | 서버 오류 |

### 페이징 (목록)
`?limit=20&cursor=<id>` → 응답에 `nextCursor` 포함.

---

## 2. Auth

### POST /auth/login/{provider}
소셜 토큰으로 로그인/가입. `provider` = kakao | apple | google

- 인증: 불필요
- Request:
```json
{ "idToken": "<provider_id_token>", "nonce": "..." }
```
- Response 200:
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "isNewUser": true,
  "onboardingCompleted": false
}
```
- 비고: 애플 첫 로그인 시 전달된 name/email을 이 시점에 저장
- US: US-1.1

### POST /auth/refresh
- Request: `{ "refreshToken": "..." }`
- Response: `{ "accessToken": "...", "refreshToken": "..." }`

### POST /auth/logout
- 인증: 필요 / Response 204

---

## 3. Users

### POST /users/onboarding
최초 온보딩 (닉네임 + 동의). 

- Request:
```json
{
  "nickname": "승욱",
  "agreements": { "terms": true, "privacy": true, "llmConsent": true, "marketing": false }
}
```
- Response 200: `{ "onboardingCompleted": true }`
- 에러: 422 `INVALID_NICKNAME`(규칙 위반), 409 `NICKNAME_TAKEN`(중복), 400 `AGREEMENT_REQUIRED`(필수 동의 누락)

**닉네임 규칙 (계약)**
- 허용 문자: 한글 완성형 · 영문 · 숫자 · 이모지
- 길이: **2~12자** — 이모지는 grapheme cluster 기준 1자(👨‍👩‍👧‍👦 · 👍🏽 · 🇰🇷 각 1자)
- 불가: 공백, 특수문자, 자음/모음 단독(ㅋㅋ·ㅜㅜ)
- 저장 전 **NFC 정규화 + trim**
- **중복 불가** — 대소문자를 무시하고 비교

### GET /users/nickname/availability
닉네임 사용 가능 여부 (온보딩 실시간 확인).

- Query: `?nickname=승욱`
- Response 200: `{ "nickname": "승욱", "available": true }`
- 에러: 422 `INVALID_NICKNAME` (형식이 어긋나면 중복을 보기 전에 막는다)
- 비고: 본인이 이미 쓰는 닉네임은 `available: true`
- US: US-1.2, US-1.3

### GET /users/me
- Response 200:
```json
{
  "id": "uuid",
  "nickname": "승욱",
  "email": null,
  "isPro": false,
  "usage": { "date": "2026-06-07", "baseQuestionUsed": 12, "limit": 20, "remaining": 8 }
}
```
- US: US-5.x, US-6.1

### PATCH /users/me
- Request: `{ "nickname": "새닉네임" }` / Response 200

### DELETE /users/me
회원 탈퇴 → 개인정보 파기 트리거.

- Response 202 (파기 배치 예약)
- 에러: 409(활성 구독 → 안내)
- US: US-7.1

---

## 4. Jobs

### GET /jobs/categories
직무 대분류 + 세부 트리 (직무 선택 화면).

- 인증: 선택
- Response 200:
```json
[
  { "id": "uuid", "name": "개발",
    "roles": [ { "id": "uuid", "name": "백엔드" }, { "id": "uuid", "name": "iOS" } ] }
]
```
- US: US-2.1a

---

## 5. Interviews (핵심)

### POST /interviews
면접 세션 생성 (입력 + 설정) → 세션 생성 및 첫 질문 반환.

- Request:
```json
{
  "jobSource": "paste",
  "jobPostingText": "주요 업무: ...",
  "jobRoleId": null,
  "customRole": null,
  "applicantInfo": "경력 3년 ...",
  "resumeRef": null,
  "interviewType": "pressure",
  "persona": "cold",
  "language": "ko",
  "difficulty": "mid",
  "questionCount": 5,
  "realtimeFeedback": false,
  "showScore": true
}
```
- Response 201:
```json
{
  "sessionId": "uuid",
  "status": "in_progress",
  "progress": { "current": 0, "total": 5 },
  "firstQuestion": { "messageId": "uuid", "seq": 1, "type": "intro_question", "content": "자기소개 부탁드립니다." }
}
```

> **`progress`는 직무 질문 기준이다.**
> 도입 질문(자기소개·지원동기, `type: "intro_question"`)은 `current`·`total` 어디에도 세지 않는다.
> 도입 구간에서는 `current: 0`이고, 첫 직무 질문이 나올 때 `current: 1`이 된다.
> `total`은 세션 생성 시 요청한 `questionCount`(5~15)와 같다.
> 근거: `Pacer_AI프롬프트설계_v1.md` §3.
- 에러:
  - **402 `FREE_QUOTA_EXCEEDED`** — 무료 2회(평생) 소진 → 페이월
  - **402 `PLAN_REQUIRED`** — 무료 사용자가 `questionCount > 5` 요청 → 페이월
  - **429 `DAILY_INTERVIEW_LIMIT`** — 하루 면접 시작 상한(약관 fair-use). 결제 문제가
    아니라 남용 방지이므로 402가 아니다
  - 422(입력 누락)
- US: US-2.1~2.3, US-3.1

### POST /interviews/{id}/answer
답변 제출 → 다음 발화(꼬리질문 or 다음 기본질문 or 종료 신호)를 **SSE 스트리밍**으로 반환.

- Request:
```json
{ "content": "저는 3년차 백엔드 개발자로..." }
```
- Response: `text/event-stream` (§8 참조)
- 부작용: 기본 질문 진행 시 사용량 카운트(꼬리질문 제외)
- 에러: 402(한도 소진 → 페이월 payload), 409(세션 종료됨)
- US: US-3.1, 3.2, US-6.1

### POST /interviews/{id}/skip
"모르겠습니다" → 다음 질문으로.

- Response 200: `{ "next": { "messageId": "uuid", "seq": 3, "type": "base_question", "content": "..." }, "progress": {"current":3,"total":5} }`
- US: US-3.3

### POST /interviews/{id}/pause
- Response 200: `{ "status": "paused" }`
- US: US-3.4

### POST /interviews/{id}/resume
- Response 200: 중단 지점 컨텍스트 반환 (최근 발화 + progress)
- US: US-3.4

### POST /interviews/{id}/complete
면접 종료 → 평가 생성 (비동기일 경우 202 + 폴링/스트림).

- Response 200:
```json
{
  "sessionId": "uuid",
  "status": "completed",
  "report": {
    "overallScore": 78,
    "showScore": true,
    "passResult": "pass",
    "passReason": "직무 이해도는 높으나 STAR 구조가 약함...",
    "weightPreset": "developer",
    "scores": [
      { "criterion": "logic", "score": 82, "weight": 0.25 },
      { "criterion": "job_fit", "score": 75, "weight": 0.35 },
      { "criterion": "structure", "score": 68, "weight": 0.2 },
      { "criterion": "keyword", "score": 85, "weight": 0.2 }
    ]
  }
}
```
- 비고: `showScore=false`여도 `passResult`·`passReason`·모범답안은 제공
- US: US-4.2, US-4.4

### POST /interviews/{id}/feedback
리포트 만족도 (MVP 성공 기준 §6 "리포트 👍 비율"의 원천).

- Request: `{ "rating": "up" | "down", "comment": "점수 근거가 약해요" }`
  - `comment`는 선택(최대 500자). 👎일 때 이유를 받는 용도
- Response 200: `{ "rating": "down", "comment": "점수 근거가 약해요" }`
- 재제출 시 기존 평가를 **갱신**한다(세션 1:1)
- 에러: 409 `SESSION_NOT_COMPLETED`(면접 미완료), 403(타인 세션)
- US: US-4.2 (평가 납득 여부 수집)

### GET /interviews/{id}
대화 전문 재열람 (메시지 + 피드백 + 리포트).

- Response 200:
```json
{
  "session": { "id": "uuid", "interviewType": "pressure", "difficulty": "mid", "status": "completed", "createdAt": "..." },
  "messages": [
    { "seq": 1, "role": "interviewer", "type": "intro_question", "content": "자기소개 부탁드립니다." },
    { "seq": 1, "role": "interviewer", "type": "base_question", "content": "..." },
    { "seq": 2, "role": "user", "type": "answer", "content": "..." },
    { "seq": 3, "role": "interviewer", "type": "follow_up", "parentId": "uuid", "content": "...",
      "feedback": { "feedback": "...", "modelAnswer": "..." } }
  ],
  "report": { "overallScore": 78, "passResult": "pass", "...": "..." },
  "feedback": { "rating": "up", "comment": null }
}
```
- `feedback`은 내가 남긴 리포트 만족도(없으면 `null`)
- US: US-5.1

### GET /interviews
내 면접 목록 (히스토리).

- Query: `?limit=20&cursor=...`
- Response 200:
```json
{
  "items": [
    { "id": "uuid", "role": "백엔드", "interviewType": "pressure", "status": "completed",
      "score": 78, "passResult": "pass", "createdAt": "..." }
  ],
  "nextCursor": "uuid"
}
```
- `status`: in_progress | paused | completed — 앱이 이어하기 진입을 판단하는 데 쓴다
- `role`은 직무를 고르지 않은 면접(공고 붙여넣기)이면 `null`
- US: US-5.1

---

## 5B. Legal (약관·처리방침)

가입 전에도 읽을 수 있어야 하므로 **인증 불필요**.

### GET /legal
- Response 200: 문서 목록 (`terms`, `privacy`) — 각 항목은 아래 문서와 동일한 형태

### GET /legal/{type}
`type` = terms | privacy

- Response 200:
```json
{
  "type": "privacy",
  "title": "개인정보 처리방침",
  "version": "0.1",
  "effectiveDate": "2026-08-15",
  "sections": [ { "heading": "1. 수집하는 개인정보 항목", "body": "..." } ]
}
```
- 에러: 404 `LEGAL_DOCUMENT_NOT_FOUND`
- 비고: `version`은 동의 이력과 대조할 수 있게 함께 내려준다
- US: US-1.3

---

## 6. Growth

### GET /growth/summary
성장 추이 (점수 추이 + 항목별 + 참여 지표).

- Query: `?period=90d`
- Response 200:
```json
{
  "scoreTrend": [ { "date": "...", "score": 71, "difficulty": "mid", "interviewType": "general" } ],
  "criteriaTrend": { "logic": [82, 85], "job_fit": [70, 75], "structure": [60, 68], "keyword": [80, 85] },
  "engagement": { "totalInterviews": 12, "streakDays": 4 }
}
```
- US: US-5.2

---

## 7. Subscriptions

### GET /subscriptions/me
- Response 200: `{ "status": "active", "platform": "apple", "productId": "pro_monthly", "expiresAt": "..." }`

### GET /subscriptions/me
내 이용권 상태. 무료 잔여 횟수를 포함한다.

- Response 200:
  ```json
  {
    "plan": "free",
    "isPro": false,
    "expiresAt": null,
    "autoRenewing": false,
    "freeInterviewsUsed": 1,
    "freeInterviewsRemaining": 1
  }
  ```
- US: US-6.2

### POST /subscriptions/verify
IAP 영수증 서버 검증 → 권한 부여. **멱등하다** — 같은 영수증을 다시 보내도
이용권이 두 번 부여되지 않고 현재 상태를 그대로 돌려준다.

- Request: `{ "platform": "apple", "receipt": "<base64>", "productId": "pro_monthly" }`
- Response 201: `GET /subscriptions/me` 와 동일한 형태
- 에러: 422(검증 실패·판매 중이 아닌 상품), 409(다른 계정이 이미 사용한 영수증)
- US: US-6.2

### POST /subscriptions/restore
- Request: `{ "platform": "apple", "receipt": "<base64>", "productId": "pro_monthly" }`
- Response 201: 복원된 이용권 상태 (verify와 같은 경로 — 스토어가 진실의 원천)
- US: US-6.2

### POST /subscriptions/notifications
스토어 서버 알림 수신 (App Store Server Notifications V2 / Google RTDN).

- 인증: 없음(스토어가 호출). **payload 서명을 검증기가 확인**한다
- Response 200: `{ "received": true }` — 200을 주지 않으면 스토어가 재시도하므로
  알 수 없는 거래도 200으로 받고 무시한다
- 상태 반영: `renewed`(만료 연장) / `canceled`(자동갱신만 해제, 기간까지 유지) /
  `refunded`·`expired`(즉시 회수)

---

## 8. SSE 스트리밍 규약 (면접 응답)

`POST /interviews/{id}/answer` 는 `text/event-stream` 으로 응답.

이벤트 종류:
```
event: feedback        # (realtimeFeedback=on) 방금 답변에 대한 즉시 피드백
data: {"text":"..."}

event: message.delta   # 다음 질문/꼬리질문 토큰 스트리밍
data: {"messageId":"uuid","type":"follow_up","delta":"캐시 무효화는"}

event: message.done    # 발화 완료
data: {"messageId":"uuid","seq":3,"type":"follow_up","progress":{"current":2,"total":5}}

event: interview.done  # 마지막 질문까지 끝 → complete 유도
data: {"sessionId":"uuid"}

event: error
data: {"code":"...","message":"..."}
```

- 한도 소진 시: 스트림을 열지 않고 **402** + 페이월 payload 반환
```json
{ "error": { "code": "QUOTA_EXCEEDED", "message": "무료 한도를 모두 사용했어요." },
  "paywall": { "remaining": 0, "products": [ { "id": "pro_monthly", "price": "₩x,xxx" } ] } }
```

---

## 9. 엔드포인트 요약

| 도메인 | 메서드 · 경로 | US |
|--------|---------------|----|
| Auth | POST /auth/login/{provider} | 1.1 |
| Auth | POST /auth/refresh · logout | 1.1 |
| Users | POST /users/onboarding | 1.2, 1.3 |
| Users | GET·PATCH·DELETE /users/me | 5·6·7 |
| Users | GET /users/nickname/availability | 1.2 |
| Jobs | GET /jobs/categories | 2.1a |
| Legal | GET /legal · GET /legal/{type} | 1.3 |
| Interviews | POST /interviews | 2.x, 3.1 |
| Interviews | POST /interviews/{id}/answer (SSE) | 3.1, 3.2, 6.1 |
| Interviews | POST /interviews/{id}/skip·pause·resume | 3.3, 3.4 |
| Interviews | POST /interviews/{id}/complete | 4.2, 4.4 |
| Interviews | POST /interviews/{id}/feedback | 4.2 |
| Interviews | GET /interviews · GET /interviews/{id} | 5.1 |
| Growth | GET /growth/summary | 5.2 |
| Subscriptions | GET·POST /subscriptions/* | 6.2 |

---

## 10. 인증·권한 정리

- 공개: `POST /auth/login/*`, `GET /jobs/categories`, `GET /legal*`, `GET /health`,
  `POST /subscriptions/notifications`(스토어 호출 — payload 서명으로 검증)
- 인증 필요: 그 외 전부
- 관리자 전용: `GET /admin/*` — `x-admin-token` 헤더. 사용자 JWT로는 통과 불가
- Pro 전용: 없음(무료도 전 기능 이용, 단 한도 제한) — 한도 초과 지점에서만 402
  - 무료: 면접 **총 2회(평생, 리셋 없음)** · **5문항 고정**
  - Pro: 무제한 · 5/10/15문항 (하루 시작 상한은 약관에만 두고 가격표에 노출하지 않는다)
- 리소스 소유권: interviews/{id} 등은 `user_id` 일치 검증 (타인 데이터 접근 403)

---

## 11. Phase A 구현 노트 (Interviews)

> Phase A(클로즈드 베타) 구현에서 확정된 사항. Phase B/P1에서 이 절을 걷어낸다.

### 요청 필드 (POST /interviews)
- 받는 값: `jobSource(paste|template)` · `jobPostingText` · `jobRoleId` · `customRole` · `applicantInfo` · `resumeRef` · `interviewType(general|pressure)` · `difficulty` · `language(ko)` · `questionCount(3~10)` · `showScore`
- **받지 않는 값(P1)**: `persona`, `realtimeFeedback`, `language=en`, `jobSource=url` → 전송 시 400
- 검증 실패 코드: `JOB_POSTING_REQUIRED` · `JOB_ROLE_REQUIRED` · `JOB_ROLE_NOT_FOUND` (422)

### 응답 보강 (명세 예시에 필드 추가)
- `POST /interviews/{id}/skip` → `{ next, progress, done }` — `done=true`면 남은 기본 질문 없음(→ complete 유도), 이때 `next=null`
- `POST /interviews/{id}/resume` → `{ status, progress, messages }` — `messages`는 최근 발화 6개
- `GET /interviews/{id}` → `session`에 `role`(직무명)·`progress` 포함, 모범답안은 해당 기본 질문 메시지의 `feedback.modelAnswer`로 붙는다
- `GET /interviews` → `items[].score`는 미완료 면접이면 `null`, 커서는 마지막 항목의 세션 id

### 동작 규약
- **한도**: 기본 질문마다 사용량을 카운트하되 Phase A는 **402를 반환하지 않는다**(페이월 미노출). 꼬리질문은 카운트 제외
- **꼬리질문**: 같은 기본 질문당 최대 2회
- **종합 점수**: LLM 값을 신뢰하지 않고 서버가 `Σ(항목 점수 × 직무 가중치)`로 재계산해 저장
- **complete 멱등**: 이미 종료된 세션은 저장된 리포트를 그대로 200으로 반환
- **에러 코드**: `SESSION_NOT_FOUND`(404) · `INTERVIEW_FORBIDDEN`(403) · `SESSION_PAUSED`/`SESSION_COMPLETED`(409) · `QUESTION_GENERATION_FAILED`(503)
