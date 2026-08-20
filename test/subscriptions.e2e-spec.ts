import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';

interface TokenBody {
  accessToken: string;
}
interface EntitlementBody {
  plan: string;
  isPro: boolean;
  expiresAt: string | null;
  autoRenewing: boolean;
  freeInterviewsUsed: number;
  freeInterviewsRemaining: number;
}
interface ErrorBody {
  error: { code: string; message: string };
}

const FREE_LIMIT = 2;
const FREE_QUESTIONS = 5;

/**
 * 구매·이용권 e2e — 스토어 계정 없이 StubReceiptVerifier로 전 구간을 돈다.
 * PostgreSQL·Redis 필요 (docker compose up -d).
 */
describe('Subscriptions (e2e)', () => {
  let app: INestApplication<App>;

  async function signUp(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login/kakao')
      .send({ idToken: `sub-e2e-${Date.now()}-${Math.random()}` })
      .expect(200);
    return (res.body as TokenBody).accessToken;
  }

  function startInterview(token: string, questionCount = FREE_QUESTIONS) {
    return request(app.getHttpServer())
      .post('/v1/interviews')
      .set('Authorization', `Bearer ${token}`)
      .send({
        jobSource: 'paste',
        jobPostingText: '주요 업무: 결제 서버 API 개발',
        applicantInfo: '경력 3년, 백엔드',
        interviewType: 'general',
        difficulty: 'mid',
        questionCount,
      });
  }

  function subscribe(token: string, receipt: string) {
    return request(app.getHttpServer())
      .post('/v1/subscriptions/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'stub', receipt, productId: 'pro_monthly' });
  }

  function entitlementOf(token: string) {
    return request(app.getHttpServer())
      .get('/v1/subscriptions/me')
      .set('Authorization', `Bearer ${token}`);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('가입 직후에는 무료 2회가 남아 있다', async () => {
    const token = await signUp();

    const res = await entitlementOf(token).expect(200);
    const body = res.body as EntitlementBody;

    expect(body.plan).toBe('free');
    expect(body.isPro).toBe(false);
    expect(body.freeInterviewsRemaining).toBe(FREE_LIMIT);
  });

  it('무료 2회를 쓰면 세 번째 면접은 402', async () => {
    const token = await signUp();

    await startInterview(token).expect(201);
    await startInterview(token).expect(201);

    const res = await startInterview(token).expect(402);
    const body = res.body as ErrorBody;

    expect(body.error.code).toBe('FREE_QUOTA_EXCEEDED');
    expect(body.error.message).toMatch(/[가-힣]/);
  });

  it('무료 사용자가 5문항을 넘겨 요청하면 402 (횟수는 깎이지 않는다)', async () => {
    const token = await signUp();

    const res = await startInterview(token, 10).expect(402);
    expect((res.body as ErrorBody).error.code).toBe('PLAN_REQUIRED');

    const after = await entitlementOf(token).expect(200);
    expect((after.body as EntitlementBody).freeInterviewsRemaining).toBe(
      FREE_LIMIT,
    );
  });

  it('구독하면 pro가 되고 10문항 면접을 시작할 수 있다', async () => {
    const token = await signUp();
    const receipt = `stub:pro-${Date.now()}-${Math.random()}`;

    const verified = await subscribe(token, receipt).expect(201);
    expect((verified.body as EntitlementBody).isPro).toBe(true);

    await startInterview(token, 10).expect(201);
  });

  it('같은 영수증을 두 번 보내도 이용권이 중복 부여되지 않는다', async () => {
    const token = await signUp();
    const receipt = `stub:idem-${Date.now()}-${Math.random()}`;

    const first = await subscribe(token, receipt).expect(201);
    const second = await subscribe(token, receipt).expect(201);

    expect((second.body as EntitlementBody).isPro).toBe(true);
    expect((second.body as EntitlementBody).expiresAt).toBe(
      (first.body as EntitlementBody).expiresAt,
    );
  });

  it('다른 계정이 쓴 영수증은 409로 막는다', async () => {
    const owner = await signUp();
    const stranger = await signUp();
    const receipt = `stub:steal-${Date.now()}-${Math.random()}`;

    await subscribe(owner, receipt).expect(201);
    await subscribe(stranger, receipt).expect(409);
  });

  it('없는 상품은 422', async () => {
    const token = await signUp();

    await request(app.getHttpServer())
      .post('/v1/subscriptions/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'stub',
        receipt: 'stub:whatever',
        productId: 'not_a_product',
      })
      .expect(422);
  });

  it('환불 알림을 받으면 이용권을 회수한다', async () => {
    const token = await signUp();
    const transactionId = `refund-${Date.now()}-${Math.random()}`;

    await subscribe(token, `stub:${transactionId}`).expect(201);

    await request(app.getHttpServer())
      .post('/v1/subscriptions/notifications')
      .send({ originalTransactionId: transactionId, type: 'refunded' })
      .expect(200);

    const after = await entitlementOf(token).expect(200);
    expect((after.body as EntitlementBody).isPro).toBe(false);
  });

  it('해지 알림은 즉시 회수하지 않는다 — 낸 기간까지는 쓸 수 있다', async () => {
    const token = await signUp();
    const transactionId = `cancel-${Date.now()}-${Math.random()}`;
    const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    await subscribe(token, `stub:${transactionId}`).expect(201);

    await request(app.getHttpServer())
      .post('/v1/subscriptions/notifications')
      .send({
        originalTransactionId: transactionId,
        type: 'canceled',
        expiresAt: expiresAt.toISOString(),
        autoRenewing: false,
      })
      .expect(200);

    const after = await entitlementOf(token).expect(200);
    const body = after.body as EntitlementBody;

    expect(body.isPro).toBe(true);
    expect(body.autoRenewing).toBe(false);
  });

  it('이용권 조회는 인증이 필요하다', async () => {
    await request(app.getHttpServer()).get('/v1/subscriptions/me').expect(401);
  });
});
