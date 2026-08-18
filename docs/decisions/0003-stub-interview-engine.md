# 0003. LLM 연동 전에 스텁 엔진으로 흐름을 먼저 완성한다

- **상태**: 채택
- **날짜**: 2026-08-17
- **관련**: `src/llm/interview-engine.ts`, `src/llm/stub-interview-engine.ts`, `../Pacer_MVP범위_v1.md` §4

## 배경

마일스톤 1(세션·메시지 API)과 마일스톤 2(LLM 파이프라인)의 순서 문제.
면접 세션 API는 질문을 생성하고 답변을 받아 다음 발화를 정하는데, 이건 본래 LLM이 하는 일이다.
LLM을 먼저 붙이지 않으면 API를 끝까지 돌려볼 수 없어 보였다.

## 결정

`InterviewEngine` **포트를 먼저 정의하고, 결정적(deterministic) 스텁 어댑터를 주입**한다.
LLM 어댑터는 마일스톤 2에서 교체한다.

```ts
// llm.module.ts
providers: [{ provide: INTERVIEW_ENGINE, useClass: StubInterviewEngine }]
```

포트는 세 메서드로 나눈다: `generateQuestions` / `decideNextTurn` / `evaluate`.

## 근거

- **API 계약을 LLM보다 먼저 고정할 수 있다.** 상위 `CLAUDE.md`의 "서버 API 선개발 → 앱 연동" 원칙상, 앱이 붙을 응답 스키마가 먼저 확정돼야 한다. LLM을 기다리면 앱 작업 전체가 막힌다
- **테스트가 결정적으로 유지된다.** 스텁은 같은 입력에 항상 같은 출력을 내므로 세션 흐름(생성 → 답변 → 꼬리질문 → 평가) E2E를 안정적으로 검증할 수 있다. LLM을 직접 붙이면 테스트가 비결정적이 되고 비용도 든다
- **LLM 키가 없어도 개발이 진행된다.** 실제로 `LLM_API_KEY`는 아직 비어 있다
- 포트를 세 메서드로 나눈 덕에 나중에 **메서드별로 다른 모델·`effort`를 쓸 수 있다** (→ [0004](./0004-phase-a-model-opus-5.md))

## 따라오는 결과

- 스텁이 주입된 동안 **면접 질문은 고정 문구**다. 품질 검증은 마일스톤 2 이후에만 의미가 있다
- `StubInterviewEngine`은 호출 시 `logger.warn`으로 스텁임을 남긴다 — 운영에 실수로 나가는 걸 막기 위해
- 교체 시 소비 측(`interviews`)은 `INTERVIEW_ENGINE` 토큰만 알므로 **변경이 없다**
