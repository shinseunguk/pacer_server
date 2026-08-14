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
- 에러: 422(닉네임 빈값), 400(필수 동의 누락)
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
  "progress": { "current": 1, "total": 5 },
  "firstQuestion": { "messageId": "uuid", "seq": 1, "type": "base_question", "content": "자기소개 부탁드립니다." }
}
```
- 에러: 402(시작 전 한도 소진 → 페이월), 422(입력 누락)
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

### GET /interviews/{id}
대화 전문 재열람 (메시지 + 피드백 + 리포트).

- Response 200:
```json
{
  "session": { "id": "uuid", "interviewType": "pressure", "difficulty": "mid", "status": "completed", "createdAt": "..." },
  "messages": [
    { "seq": 1, "role": "interviewer", "type": "base_question", "content": "..." },
    { "seq": 2, "role": "user", "type": "answer", "content": "..." },
    { "seq": 3, "role": "interviewer", "type": "follow_up", "parentId": "uuid", "content": "...",
      "feedback": { "feedback": "...", "modelAnswer": "..." } }
  ],
  "report": { "overallScore": 78, "passResult": "pass", "...": "..." }
}
```
- US: US-5.1

### GET /interviews
내 면접 목록 (히스토리).

- Query: `?limit=20&cursor=...`
- Response 200:
```json
{
  "items": [
    { "id": "uuid", "role": "백엔드", "interviewType": "pressure", "score": 78, "passResult": "pass", "createdAt": "..." }
  ],
  "nextCursor": "uuid"
}
```
- US: US-5.1

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

### POST /subscriptions/verify
IAP 영수증 서버 검증 → 권한 부여.

- Request: `{ "platform": "apple", "receipt": "<base64>", "productId": "pro_monthly" }`
- Response 200: `{ "status": "active", "expiresAt": "...", "isPro": true }`
- 에러: 422(검증 실패)
- US: US-6.2

### POST /subscriptions/restore
- Request: `{ "platform": "apple", "receipt": "<base64>" }`
- Response 200: 복원된 구독 상태
- US: US-6.2

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
| Jobs | GET /jobs/categories | 2.1a |
| Interviews | POST /interviews | 2.x, 3.1 |
| Interviews | POST /interviews/{id}/answer (SSE) | 3.1, 3.2, 6.1 |
| Interviews | POST /interviews/{id}/skip·pause·resume | 3.3, 3.4 |
| Interviews | POST /interviews/{id}/complete | 4.2, 4.4 |
| Interviews | GET /interviews · GET /interviews/{id} | 5.1 |
| Growth | GET /growth/summary | 5.2 |
| Subscriptions | GET·POST /subscriptions/* | 6.2 |

---

## 10. 인증·권한 정리

- 공개: `POST /auth/login/*`, `GET /jobs/categories`
- 인증 필요: 그 외 전부
- Pro 전용: 없음(무료도 전 기능 이용, 단 한도 제한) — 한도 초과 지점에서만 402
- 리소스 소유권: interviews/{id} 등은 `user_id` 일치 검증 (타인 데이터 접근 403)
