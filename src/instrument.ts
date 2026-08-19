import 'dotenv/config';
import * as Sentry from '@sentry/nestjs';
import { scrubEvent } from './common/observability/scrub-event';

/**
 * Sentry 초기화.
 *
 * 계측이 다른 모듈보다 먼저 걸려야 하므로 **main.ts의 첫 줄에서 import**한다.
 * ConfigService는 아직 없어 `process.env`를 직접 읽는다(그래서 dotenv를 먼저 로드).
 *
 * DSN이 없으면 아무것도 초기화하지 않는다 — 로컬 개발과 CI가 그대로 돌아간다.
 */
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),

    // 면접 답변·자소서·공고 원문은 민감 개인정보다. 기본 PII 수집을 끄고,
    // beforeSend에서 본문까지 걷어낸다 (CLAUDE.md 보안 주의).
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
}
