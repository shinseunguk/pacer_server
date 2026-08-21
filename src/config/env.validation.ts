import * as Joi from 'joi';

/**
 * 부팅 시 환경변수 검증 스키마.
 * 마일스톤 1에서 실제 사용하는 값(DB·Redis)만 required로 두고,
 * 이후 마일스톤에서 쓰는 값(JWT·소셜·LLM)은 optional로 둔다.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().required(),

  // 마일스톤 3 (인증)
  JWT_ACCESS_SECRET: Joi.string().optional(),
  JWT_REFRESH_SECRET: Joi.string().optional(),
  JWT_ACCESS_TTL: Joi.number().default(900),
  JWT_REFRESH_TTL: Joi.number().default(1209600),

  // 마일스톤 3 (소셜 로그인)
  KAKAO_REST_API_KEY: Joi.string().allow('').optional(),
  APPLE_CLIENT_ID: Joi.string().allow('').optional(),
  APPLE_TEAM_ID: Joi.string().allow('').optional(),
  APPLE_KEY_ID: Joi.string().allow('').optional(),

  // 사용량 — Phase A는 페이월 미노출이라 넉넉히 두고, Phase B에서 20으로 조인다.
  FREE_DAILY_QUESTION_LIMIT: Joi.number().default(20),
  // 하루 면접 시작 상한 (약관 fair-use). 가격표에는 노출하지 않는다.
  DAILY_INTERVIEW_LIMIT: Joi.number().default(5),

  // 보안 — CORS 화이트리스트(쉼표 구분), 요청 상한(창 초 / 창당 요청 수)
  CORS_ORIGINS: Joi.string().allow('').optional(),
  // Nginx 등 리버스 프록시 뒤에 둘 때만 'true' (X-Forwarded-For 신뢰)
  TRUST_PROXY: Joi.string().valid('true', 'false').default('false'),
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(120),
  THROTTLE_AUTH_LIMIT: Joi.number().default(10),

  // 개인정보 — 공고 원문·자소서 보관 기간(일). 지나면 파기 배치가 지운다.
  SENSITIVE_RETENTION_DAYS: Joi.number().default(90),

  // 관측 — DSN이 없으면 Sentry를 초기화하지 않는다(로컬/CI 그대로 동작).
  SENTRY_DSN: Joi.string().allow('').optional(),
  SENTRY_ENVIRONMENT: Joi.string().allow('').optional(),
  SENTRY_TRACES_SAMPLE_RATE: Joi.number().min(0).max(1).default(0),

  // 마일스톤 2 (LLM 프록시)
  LLM_API_KEY: Joi.string().allow('').optional(),

  // 모델 교체는 배포 없이 env로 — 강등 판단은 데이터가 쌓인 뒤에 한다 (ADR 0004).
  LLM_MODEL: Joi.string().allow('').optional(),

  // 메서드별 지정(선택). 없으면 LLM_MODEL → claude-opus-5 순으로 떨어진다.
  LLM_MODEL_GENERATE_QUESTIONS: Joi.string().allow('').optional(),
  LLM_MODEL_DECIDE_NEXT_TURN: Joi.string().allow('').optional(),
  LLM_MODEL_EVALUATE: Joi.string().allow('').optional(),

  // 운영 대시보드 토큰. 미설정이면 /admin/metrics는 전부 401이 된다 (닫힌 기본값).
  ADMIN_API_TOKEN: Joi.string().allow('').optional(),
});
