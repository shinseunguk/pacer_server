import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';

interface LegalBody {
  type: string;
  title: string;
  version: string;
  effectiveDate: string;
  sections: { heading: string; body: string }[];
}
interface ErrorBody {
  error: { code: string; message: string };
}

/** 약관·처리방침 e2e — 가입 전(비인증)에도 열람할 수 있어야 한다. */
describe('Legal (e2e)', () => {
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

  it('인증 없이 목록을 볼 수 있다', async () => {
    const res = await request(app.getHttpServer()).get('/v1/legal').expect(200);

    expect((res.body as LegalBody[]).map((doc) => doc.type)).toEqual([
      'terms',
      'privacy',
    ]);
  });

  it('처리방침 원문을 내려준다', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/legal/privacy')
      .expect(200);

    const body = res.body as LegalBody;
    expect(body.title).toBe('개인정보 처리방침');
    expect(body.version).toMatch(/^\d+\.\d+$/);
    expect(body.sections.length).toBeGreaterThan(0);
  });

  it('없는 문서 종류는 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/legal/unknown')
      .expect(404);

    expect((res.body as ErrorBody).error.code).toBe('LEGAL_DOCUMENT_NOT_FOUND');
  });
});
