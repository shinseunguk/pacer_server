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

  // 마일스톤 2 (LLM 프록시)
  LLM_API_KEY: Joi.string().allow('').optional(),
});
