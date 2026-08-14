import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';

interface CategoryTree {
  id: string;
  name: string;
  roles: { id: string; name: string }[];
}

/**
 * 직무 조회 e2e — PostgreSQL 필요 (docker compose up -d && npm run db:seed).
 */
describe('Jobs (e2e)', () => {
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

  it('GET /v1/jobs/categories → 인증 없이 시드 트리를 반환한다', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/jobs/categories')
      .expect(200);

    const body = res.body as CategoryTree[];
    expect(body.length).toBeGreaterThan(0);

    const development = body.find((category) => category.name === '개발');
    expect(development).toBeDefined();
    expect(development!.roles.length).toBeGreaterThan(0);
    expect(development!.roles[0]).toEqual({
      id: expect.any(String) as string,
      name: expect.any(String) as string,
    });
  });

  it('모든 카테고리가 하나 이상의 직무를 가진다', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/jobs/categories')
      .expect(200);

    for (const category of res.body as CategoryTree[]) {
      expect(category.roles.length).toBeGreaterThan(0);
    }
  });
});
