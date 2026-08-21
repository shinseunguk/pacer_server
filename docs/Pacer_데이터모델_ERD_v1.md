# 페이서 (Pacer) — 데이터 모델 / ERD v1

> 상위 문서: 기획서 v1, 기능 명세 v1, 화면 정의서 v1
> DB: PostgreSQL (주 데이터) + Redis (카운터·캐시)
> 다음 단계: API 명세

---

## 1. 개요

- 모든 PK는 `uuid` (분산·노출 안전)
- 공통 컬럼: `created_at`, `updated_at` (필요 테이블), soft delete는 `deleted_at`
- 민감 정보(이력서·자소서·공고·답변)는 파기 정책 대상 (§5)
- 실시간 카운터·캐시는 Redis, 영속 데이터는 PostgreSQL (§4)

---

## 2. 테이블 정의

### users
사용자 계정 (소셜 로그인).

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| social_provider | varchar | NOT NULL | kakao / apple / google |
| social_id | varchar | NOT NULL | 공급자별 고유 ID |
| nickname | varchar | NOT NULL | 온보딩 입력값(정본) |
| email | varchar | NULL | 애플 relay/거부 대비 nullable |
| is_pro | boolean | default false | 구독 활성 캐시값(정본은 subscriptions) |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |
| deleted_at | timestamptz | NULL | 탈퇴 시각(파기 처리 트리거) |

- 인덱스: UNIQUE(`social_provider`, `social_id`)

### user_agreements
약관·개인정보·LLM 전송 동의 이력.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| user_id | uuid | FK→users | |
| terms | boolean | NOT NULL | 이용약관(필수) |
| privacy | boolean | NOT NULL | 개인정보 처리(필수) |
| llm_consent | boolean | NOT NULL | LLM 전송 고지 동의(필수) |
| marketing | boolean | default false | 선택 |
| agreed_at | timestamptz | NOT NULL | |

### job_categories / job_roles
직무 마스터 (대분류 → 세부).

**job_categories**: `id(uuid PK)`, `name(varchar)`, `sort_order(int)`
**job_roles**: `id(uuid PK)`, `category_id(FK→job_categories)`, `name(varchar)`, `sort_order(int)`

- 세션은 `job_role_id`로 참조. "기타·직접입력"은 role 미지정 + 세션의 `custom_role` 사용.
- 화면에 보이는 이름은 **회사 + 직무**를 붙여 만든다 (예: "빗썸 iOS 개발자").
  - 회사: `derived_company` — 공고에서만 나온다.
  - 직무: `job_roles.name` → `custom_role` → `derived_role` 순.
- **회사와 직무를 한 칸에 합치지 않는 이유**: 같은 사용자의 이력은 직무가 거의 고정이고
  회사만 바뀐다. 합쳐서 받으면 사용자가 직무를 직접 고른 순간 회사까지 함께 사라져
  이력이 전부 같은 이름이 된다.
- `custom_role`에 추출값을 덮지 않는다 — 사용자 입력과 추측이 섞이면 어느 쪽인지 알 수 없다.

### interview_sessions
면접 1건(설정 + 결과 요약).

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| user_id | uuid | FK→users | |
| job_role_id | uuid | FK→job_roles, NULL | 템플릿 선택 시 |
| custom_role | varchar | NULL | 기타 직접입력 |
| derived_company | varchar | NULL | 공고에서 LLM이 읽어낸 회사명 (질문 생성 시 1회) |
| derived_role | varchar | NULL | 공고에서 LLM이 읽어낸 직무명 (질문 생성 시 1회) |
| job_source | varchar | NOT NULL | paste / url / template |
| job_posting_text | text | NULL | 공고 원문(민감·파기 대상) |
| applicant_info | text | NULL | 경력·자소서(민감·파기 대상) |
| resume_ref | varchar | NULL | 이력서 저장 참조(선택) |
| interview_type | varchar | NOT NULL | general/pressure/personality/job/executive |
| persona | varchar | NULL | 페르소나(P1) |
| language | varchar | default 'ko' | ko / en |
| difficulty | varchar | NOT NULL | low / mid / high |
| question_count | int | NOT NULL | 기본 질문 수 설정 |
| realtime_feedback | boolean | default true | 실시간 피드백 on/off |
| show_score | boolean | default true | 점수 표시 on/off |
| status | varchar | NOT NULL | in_progress / paused / completed |
| final_score | int | NULL | 종합 점수(완료 시) |
| pass_result | varchar | NULL | pass / fail |
| created_at | timestamptz | NOT NULL | |
| completed_at | timestamptz | NULL | |

- 인덱스: `user_id`, (`user_id`, `created_at`) — 히스토리 정렬

### interview_messages
면접 대화 발화(질문/답변/꼬리질문) — 대화 전문 재열람의 원천.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| session_id | uuid | FK→interview_sessions | |
| seq | int | NOT NULL | 세션 내 순서 |
| role | varchar | NOT NULL | interviewer / user |
| type | varchar | NOT NULL | intro_question / base_question / follow_up / answer / skip |
| content | text | NULL | 발화 내용(스킵은 NULL 가능) |
| parent_id | uuid | FK→interview_messages, NULL | 꼬리질문이 파고든 답변 참조 |
| created_at | timestamptz | NOT NULL | |

- 인덱스: (`session_id`, `seq`)

### session_evaluations
세션 최종 평가 (세션 1:1).

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| session_id | uuid | FK, UNIQUE | 1:1 |
| overall_score | int | NOT NULL | 100점 만점 |
| pass_result | varchar | NOT NULL | pass / fail |
| pass_reason | text | NOT NULL | 합불 판정 근거 |
| weight_preset | varchar | NOT NULL | 적용된 직무 가중치 프리셋 |
| created_at | timestamptz | NOT NULL | |

### evaluation_scores
평가 항목별 점수 (평가 1:N).

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| evaluation_id | uuid | FK→session_evaluations | |
| criterion | varchar | NOT NULL | logic / job_fit / structure / keyword |
| score | int | NOT NULL | 항목 점수 |
| weight | numeric | NULL | 해당 항목 가중치 |

### message_feedbacks
질문/답변 단위 피드백 + 모범답안 (메시지 1:N, 보통 질문 메시지에 연결).

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| message_id | uuid | FK→interview_messages | |
| feedback | text | NULL | 실시간/사후 피드백 |
| model_answer | text | NULL | 일반 모범답안 |
| created_at | timestamptz | NOT NULL | |

### subscriptions
구독 (영수증 기반, 정본).

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| user_id | uuid | FK→users | |
| platform | varchar | NOT NULL | apple / google |
| product_id | varchar | NOT NULL | 구독 상품 |
| original_transaction_id | varchar | NULL | 갱신 추적 |
| status | varchar | NOT NULL | active / expired / cancelled / grace |
| expires_at | timestamptz | NULL | 만료 시각 |
| latest_receipt | text | NULL | 검증용 최신 영수증 |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

- 인덱스: `user_id`, `original_transaction_id`

### daily_usage
일별 기본 질문 사용량 (영속 백업; 실시간은 Redis).

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| user_id | uuid | FK→users | |
| usage_date | date | NOT NULL | KST 기준 날짜 |
| base_question_count | int | default 0 | 직무 질문만 카운트 (꼬리질문·도입 질문 제외) |

- 인덱스: UNIQUE(`user_id`, `usage_date`)

---

## 3. 주요 관계 요약

- users 1:N interview_sessions / subscriptions / user_agreements / daily_usage
- interview_sessions 1:N interview_messages
- interview_sessions 1:1 session_evaluations
- session_evaluations 1:N evaluation_scores
- interview_messages 1:N message_feedbacks
- job_categories 1:N job_roles → 1:N interview_sessions

---

## 4. Redis 사용 (PostgreSQL 보완)

| 용도 | 키 예시 | 설명 |
|------|---------|------|
| 하루 질문 카운터 | `usage:{user_id}:{yyyymmdd}` | 기본 질문 증가, **자정(KST) TTL 만료** |
| 세션 진행 캐시 | `session:{session_id}` | 진행 중 상태 임시 |
| LLM 응답 캐시 | `llm:{hash}` | 동일 프롬프트 캐시(비용 절감) |

- 카운터의 정본은 Redis(실시간), 일 마감 후 `daily_usage`로 집계 백업 가능.

---

## 5. 개인정보 · 파기 정책 (개인정보보호법)

- **민감 대상 컬럼**: `job_posting_text`, `applicant_info`, `resume_ref`, `interview_messages.content`
- **탈퇴 시(users.deleted_at 설정)**: 관련 세션·메시지·평가·구독 데이터를 파기 배치로 지체 없이 삭제/익명화
- **최소 수집**: 이력서 원문은 분석 후 미저장 옵션 검토 → 저장 시 `resume_ref`만, 원문은 만료 삭제
- **LLM 전송 고지**: `user_agreements.llm_consent` 필수 동의 후에만 민감 데이터 LLM 전송
- **접근 로깅**: 민감 데이터 접근 감사 로그 고려 (ISMS-P 관점)

---

## 6. Enum 값 정리 (참고)

- social_provider: kakao / apple / google
- job_source: paste / url / template
- interview_type: general / pressure / personality / job / executive
- language: ko / en
- difficulty: low / mid / high
- session.status: in_progress / paused / completed
- pass_result: pass / fail
- message.role: interviewer / user
- message.type: intro_question / base_question / follow_up / answer / skip
  - `intro_question`: 자기소개·지원동기. **문항 수·진행도·평가에서 제외**하고 대화록에만 남긴다
    (`Pacer_AI프롬프트설계_v1.md` §3)
- criterion: logic / job_fit / structure / keyword
- subscription.status: active / expired / cancelled / grace

> Enum은 DB enum 타입 vs varchar+체크 중 선택. 확장 유연성 위해 varchar + 애플리케이션 검증 권장.
