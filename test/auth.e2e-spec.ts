import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';

interface TokenBody {
  accessToken?: string;
  refreshToken?: string;
  isNewUser?: boolean;
  onboardingCompleted?: boolean;
}
interface ErrorBody {
  error: { code: string; message: string };
}

/**
 * 인증 e2e — PostgreSQL·Redis 필요 (docker compose up -d).
 * dev 환경 + 소셜 키 미설정이므로 MockSocialVerifier가 사용된다.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

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

  it('POST /v1/auth/login/kakao → 토큰 발급', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login/kakao')
      .send({ idToken: 'e2e-kakao-1|e2e@test.com|E2E' })
      .expect(200);

    const body = res.body as TokenBody;
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(body.onboardingCompleted).toBe(false);
  });

  it('POST /v1/auth/refresh → 새 토큰 회전', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login/kakao')
      .send({ idToken: 'e2e-kakao-2' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: (login.body as TokenBody).refreshToken })
      .expect(200);

    const body = res.body as TokenBody;
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
  });

  it('발급받은 access 토큰으로 보호된 엔드포인트 통과 → 204', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login/kakao')
      .send({ idToken: 'e2e-kakao-3' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${(login.body as TokenBody).accessToken!}`)
      .expect(204);
  });

  it('로그아웃 후 기존 refresh 토큰은 401', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login/kakao')
      .send({ idToken: 'e2e-kakao-4' })
      .expect(200);
    const { accessToken, refreshToken } = login.body as TokenBody;

    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken!}`)
      .expect(204);

    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('보호된 엔드포인트는 토큰 없으면 401 (에러 포맷)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .expect(401);

    expect((res.body as ErrorBody).error.code).toBe('UNAUTHORIZED');
  });

  it('지원하지 않는 provider는 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/login/facebook')
      .send({ idToken: 'x' })
      .expect(400);
  });
});
