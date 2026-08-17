import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import helmet from 'helmet';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';

const TOO_MANY_REQUESTS = 429;

/** 이 스펙에서만 상한을 낮춰 실제로 걸리는지 확인한다. */
const LIMIT = 5;

/**
 * 보안 미들웨어 e2e — helmet 헤더 · rate limit · 헬스체크 예외.
 * PostgreSQL·Redis 필요 (docker compose up -d).
 */
describe('Security (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // env는 AppModule import 시점에 이미 고정되므로 옵션 provider를 갈아끼운다.
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getOptionsToken())
      .useValue([{ ttl: 60_000, limit: LIMIT }])
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(helmet({ contentSecurityPolicy: false }));
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

  it('helmet 보안 헤더를 붙인다', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/health')
      .expect(200);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    // API 서버는 기술 스택을 노출할 이유가 없다.
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('상한을 넘기면 429로 막는다', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < LIMIT + 2; i += 1) {
      const res = await request(app.getHttpServer()).get('/v1/jobs/categories');
      statuses.push(res.status);
    }

    expect(
      statuses.filter((status) => status === TOO_MANY_REQUESTS).length,
    ).toBeGreaterThan(0);
    expect(statuses[0]).toBe(200);
  });

  it('헬스체크는 상한 대상에서 제외한다', async () => {
    for (let i = 0; i < LIMIT + 2; i += 1) {
      await request(app.getHttpServer()).get('/v1/health').expect(200);
    }
  });
});
