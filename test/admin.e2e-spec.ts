import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';

interface MetricsBody {
  period: { from: string; to: string };
  service: { users: number; sessions: number; completionRate: number };
  cost: { calls: number; costUsd: number; estimateRatio: number | null };
  daily: { date: string; costUsd: number }[];
  unavailable: string[];
}

/** 운영 대시보드 e2e — 토큰 없이는 지표가 새어나가지 않아야 한다. */
describe('Admin (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;

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

    adminToken = app.get(ConfigService).get<string>('ADMIN_API_TOKEN') ?? '';
    if (!adminToken) {
      // 가드는 토큰이 없으면 모든 요청을 막는다(닫힌 기본값). 그 상태로는
      // "지표를 내려준다"를 검증할 수 없으므로 원인을 분명히 알리고 멈춘다.
      throw new Error(
        'ADMIN_API_TOKEN이 없어 대시보드 e2e를 실행할 수 없습니다. .env 또는 CI env에 설정하세요.',
      );
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('토큰 없이 지표를 요청하면 401', async () => {
    await request(app.getHttpServer()).get('/v1/admin/metrics').expect(401);
  });

  it('틀린 토큰도 401', async () => {
    await request(app.getHttpServer())
      .get('/v1/admin/metrics')
      .set('x-admin-token', 'nope')
      .expect(401);
  });

  it('대시보드 페이지 자체는 데이터 없이 열린다', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/admin')
      .expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('Pacer 운영 대시보드');
    // 껍데기일 뿐 — 지표가 HTML에 박혀 나가면 공개 페이지로 둘 수 없다.
    expect(response.text).not.toContain('costUsd"');
  });

  it('토큰이 맞으면 지표를 내려준다', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/admin/metrics?days=7')
      .set('x-admin-token', adminToken)
      .expect(200);

    const body = response.body as MetricsBody;

    expect(body.service.users).toBeGreaterThanOrEqual(0);
    expect(body.cost.calls).toBeGreaterThanOrEqual(0);
    expect(body.unavailable).toContain('subscriptions');
    expect(new Date(body.period.to).getTime()).toBeGreaterThan(
      new Date(body.period.from).getTime(),
    );
  });

  it('기간 파라미터를 검증한다', async () => {
    await request(app.getHttpServer())
      .get('/v1/admin/metrics?days=0')
      .set('x-admin-token', adminToken)
      .expect(400);

    await request(app.getHttpServer())
      .get('/v1/admin/metrics?days=9999')
      .set('x-admin-token', adminToken)
      .expect(400);
  });

  it('응답 어디에도 면접 답변·공고 원문이 없다', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/admin/metrics?days=30')
      .set('x-admin-token', adminToken)
      .expect(200);

    const raw = JSON.stringify(response.body);
    // 집계에 원문이 필요하지 않다. 키 이름조차 새어나오면 안 된다.
    for (const field of [
      'jobPostingText',
      'applicantInfo',
      'content',
      'answer',
    ]) {
      expect(raw).not.toContain(field);
    }
  });
});
