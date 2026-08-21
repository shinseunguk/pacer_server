/**
 * e2e 공통 환경.
 *
 * 테스트는 같은 IP에서 요청을 몰아치므로 rate limit을 넉넉히 열어둔다.
 * (제한 자체의 동작은 security.e2e-spec.ts가 옵션을 갈아끼워 검증한다.)
 * ConfigModule.forRoot는 모듈 import 시점에 env를 검증하므로 여기서 미리 설정한다.
 */
// 소셜 로그인은 MockSocialVerifier로 고정한다.
// .env 에 실제 키가 있으면 서버가 실제 검증기로 전환되어(의도된 동작) 목 토큰이 401이 된다.
// dotenv는 이미 설정된 값을 덮지 않으므로, delete가 아니라 빈 값으로 선점해야 한다.
process.env.KAKAO_REST_API_KEY = '';
process.env.APPLE_CLIENT_ID = '';

// LLM도 같은 이유로 비운다. .env에 실키가 있으면 e2e가 실제로 과금되는 호출을 쏘고,
// 매 실행이 수십 초씩 걸린다. 어댑터 자체는 anthropic-interview-engine.spec.ts가 검증한다.
process.env.LLM_API_KEY = '';

process.env.THROTTLE_LIMIT = process.env.THROTTLE_LIMIT ?? '10000';
process.env.THROTTLE_AUTH_LIMIT = process.env.THROTTLE_AUTH_LIMIT ?? '10000';
process.env.THROTTLE_TTL = process.env.THROTTLE_TTL ?? '60';

// 하루 면접 상한(기본 5)은 약관 fair-use 안전장치다. 스펙은 한 사용자로 세션을
// 여러 개 만들므로 여기서 넉넉히 연다. 상한 자체는 usage.service.spec.ts가 검증한다.
process.env.DAILY_INTERVIEW_LIMIT = process.env.DAILY_INTERVIEW_LIMIT ?? '1000';
