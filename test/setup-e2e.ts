/**
 * e2e 공통 환경.
 *
 * 테스트는 같은 IP에서 요청을 몰아치므로 rate limit을 넉넉히 열어둔다.
 * (제한 자체의 동작은 security.e2e-spec.ts가 옵션을 갈아끼워 검증한다.)
 * ConfigModule.forRoot는 모듈 import 시점에 env를 검증하므로 여기서 미리 설정한다.
 */
process.env.THROTTLE_LIMIT = process.env.THROTTLE_LIMIT ?? '10000';
process.env.THROTTLE_AUTH_LIMIT = process.env.THROTTLE_AUTH_LIMIT ?? '10000';
process.env.THROTTLE_TTL = process.env.THROTTLE_TTL ?? '60';
