import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';

interface TokenBody {
  accessToken: string;
  refreshToken: string;
}
interface ProfileBody {
  id: string;
  nickname: string;
  email: string | null;
  isPro: boolean;
  usage: {
    date: string;
    baseQuestionUsed: number;
    limit: number;
    remaining: number;
  };
}
interface ErrorBody {
  error: { code: string; message: string };
}

const ALL_AGREED = {
  terms: true,
  privacy: true,
  llmConsent: true,
  marketing: false,
};

/** 닉네임은 유니크 제약이 있으므로 실행마다 겹치지 않게 만든다(2~12자, 한글+숫자). */
let nicknameSeq = 0;
function uniqueNickname(prefix = '승욱'): string {
  nicknameSeq += 1;
  return `${prefix}${(Date.now() % 100000) * 10 + (nicknameSeq % 10)}`;
}

/**
 * 사용자 온보딩·프로필·탈퇴 e2e — PostgreSQL·Redis 필요 (docker compose up -d).
 * 로그인은 MockSocialVerifier를 사용한다(idToken = socialId).
 */
describe('Users (e2e)', () => {
  let app: INestApplication<App>;

  /** 매 테스트마다 새 사용자로 로그인해 access 토큰을 얻는다. */
  async function loginAs(socialId: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login/kakao')
      .send({ idToken: socialId })
      .expect(200);
    return (res.body as TokenBody).accessToken;
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

  it('온보딩 → 프로필에 닉네임·사용량이 반영된다', async () => {
    const token = await loginAs(`e2e-users-${Date.now()}-onboard`);
    const nickname = uniqueNickname();

    await request(app.getHttpServer())
      .post('/v1/users/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ nickname: `  ${nickname}  `, agreements: ALL_AGREED })
      .expect(200)
      .expect({ onboardingCompleted: true });

    const res = await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body as ProfileBody;
    expect(body.nickname).toBe(nickname);
    expect(body.isPro).toBe(false);
    expect(body.usage.baseQuestionUsed).toBe(0);
    expect(body.usage.remaining).toBe(body.usage.limit);
    expect(body.usage.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('온보딩 후 로그인하면 onboardingCompleted=true', async () => {
    const socialId = `e2e-users-${Date.now()}-repeat`;
    const token = await loginAs(socialId);

    await request(app.getHttpServer())
      .post('/v1/users/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ nickname: uniqueNickname(), agreements: ALL_AGREED })
      .expect(200);

    const relogin = await request(app.getHttpServer())
      .post('/v1/auth/login/kakao')
      .send({ idToken: socialId })
      .expect(200);

    expect(
      (relogin.body as { onboardingCompleted: boolean }).onboardingCompleted,
    ).toBe(true);
  });

  it('닉네임이 빈값이면 422', async () => {
    const token = await loginAs(`e2e-users-${Date.now()}-blank`);

    const res = await request(app.getHttpServer())
      .post('/v1/users/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ nickname: '   ', agreements: ALL_AGREED })
      .expect(422);

    expect((res.body as ErrorBody).error.code).toBe('INVALID_NICKNAME');
  });

  it('규칙에 없는 문자(자음 단독·특수문자)는 422', async () => {
    const token = await loginAs(`e2e-users-${Date.now()}-charset`);

    for (const bad of ['ㅋㅋ', '승욱!', '신 승욱']) {
      const res = await request(app.getHttpServer())
        .post('/v1/users/onboarding')
        .set('Authorization', `Bearer ${token}`)
        .send({ nickname: bad, agreements: ALL_AGREED })
        .expect(422);

      expect((res.body as ErrorBody).error.code).toBe('INVALID_NICKNAME');
    }
  });

  it('이모지 닉네임은 허용한다', async () => {
    const token = await loginAs(`e2e-users-${Date.now()}-emoji`);
    // 가족 이모지(ZWJ)는 여러 코드포인트지만 1자로 센다.
    const nickname = `${uniqueNickname('불꽃')}🔥👨‍👩‍👧‍👦`;

    await request(app.getHttpServer())
      .post('/v1/users/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ nickname, agreements: ALL_AGREED })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect((res.body as ProfileBody).nickname).toBe(nickname);
  });

  it('다른 사람이 쓰는 닉네임이면 409', async () => {
    const nickname = uniqueNickname('선점');
    const owner = await loginAs(`e2e-users-${Date.now()}-owner`);
    const other = await loginAs(`e2e-users-${Date.now()}-other`);

    await request(app.getHttpServer())
      .post('/v1/users/onboarding')
      .set('Authorization', `Bearer ${owner}`)
      .send({ nickname, agreements: ALL_AGREED })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/v1/users/onboarding')
      .set('Authorization', `Bearer ${other}`)
      .send({ nickname, agreements: ALL_AGREED })
      .expect(409);

    expect((res.body as ErrorBody).error.code).toBe('NICKNAME_TAKEN');
  });

  it('대소문자만 다른 닉네임도 중복으로 막는다', async () => {
    const nickname = `Pacer${Date.now() % 100000}`;
    const owner = await loginAs(`e2e-users-${Date.now()}-case-owner`);
    const other = await loginAs(`e2e-users-${Date.now()}-case-other`);

    await request(app.getHttpServer())
      .post('/v1/users/onboarding')
      .set('Authorization', `Bearer ${owner}`)
      .send({ nickname, agreements: ALL_AGREED })
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/users/onboarding')
      .set('Authorization', `Bearer ${other}`)
      .send({ nickname: nickname.toLowerCase(), agreements: ALL_AGREED })
      .expect(409);
  });

  it('본인이 쓰던 닉네임은 다시 저장해도 통과한다(멱등)', async () => {
    const token = await loginAs(`e2e-users-${Date.now()}-self`);
    const nickname = uniqueNickname('본인');

    for (let i = 0; i < 2; i += 1) {
      await request(app.getHttpServer())
        .post('/v1/users/onboarding')
        .set('Authorization', `Bearer ${token}`)
        .send({ nickname, agreements: ALL_AGREED })
        .expect(200);
    }
  });

  it('닉네임 사용 가능 여부를 미리 확인한다', async () => {
    const token = await loginAs(`e2e-users-${Date.now()}-avail`);
    const nickname = uniqueNickname('확인');

    const free = await request(app.getHttpServer())
      .get('/v1/users/nickname/availability')
      .query({ nickname })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(free.body).toEqual({ nickname, available: true });

    const owner = await loginAs(`e2e-users-${Date.now()}-avail-owner`);
    await request(app.getHttpServer())
      .post('/v1/users/onboarding')
      .set('Authorization', `Bearer ${owner}`)
      .send({ nickname, agreements: ALL_AGREED })
      .expect(200);

    const taken = await request(app.getHttpServer())
      .get('/v1/users/nickname/availability')
      .query({ nickname })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(taken.body).toEqual({ nickname, available: false });
  });

  it('필수 동의가 빠지면 400', async () => {
    const token = await loginAs(`e2e-users-${Date.now()}-agree`);

    const res = await request(app.getHttpServer())
      .post('/v1/users/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nickname: uniqueNickname(),
        agreements: { ...ALL_AGREED, privacy: false },
      })
      .expect(400);

    expect((res.body as ErrorBody).error.code).toBe('AGREEMENT_REQUIRED');
  });

  it('PATCH /users/me 로 닉네임을 수정한다', async () => {
    const token = await loginAs(`e2e-users-${Date.now()}-patch`);
    const renamed = uniqueNickname('새닉');

    await request(app.getHttpServer())
      .post('/v1/users/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({ nickname: uniqueNickname('이전닉'), agreements: ALL_AGREED })
      .expect(200);

    const res = await request(app.getHttpServer())
      .patch('/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ nickname: renamed })
      .expect(200);

    expect((res.body as ProfileBody).nickname).toBe(renamed);
  });

  it('탈퇴하면 202이고 이후 프로필 조회는 404', async () => {
    const token = await loginAs(`e2e-users-${Date.now()}-withdraw`);

    await request(app.getHttpServer())
      .delete('/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(202);

    const res = await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect((res.body as ErrorBody).error.code).toBe('USER_NOT_FOUND');
  });

  it('인증 없이 접근하면 401', async () => {
    await request(app.getHttpServer()).get('/v1/users/me').expect(401);
  });
});
