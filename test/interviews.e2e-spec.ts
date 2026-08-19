import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';

interface TokenBody {
  accessToken: string;
}
interface MessageBody {
  messageId: string;
  seq: number;
  role: string;
  type: string;
  content: string | null;
}
interface CreateBody {
  sessionId: string;
  status: string;
  progress: { current: number; total: number };
  firstQuestion: MessageBody;
}
interface SkipBody {
  next: MessageBody | null;
  progress: { current: number; total: number };
  done: boolean;
}
interface ReportBody {
  overallScore: number;
  showScore: boolean;
  passResult: string;
  passReason: string;
  weightPreset: string;
  scores: { criterion: string; score: number; weight: number }[];
}
interface ErrorBody {
  error: { code: string; message: string };
}

/** 직무 질문 수. 하한이 5로 올라갔다 (프롬프트 설계 §3, ADR 0006). */
const QUESTION_COUNT = 5;
/** 도입 질문(자기소개·지원동기) — 문항 수에 포함되지 않는다. */
const INTRO_QUESTION_COUNT = 2;
const ANSWER =
  '3년차 백엔드 개발자로 결제 API의 응답 지연을 40% 줄인 경험이 있습니다.';

/**
 * 면접 세션·메시지 e2e — PostgreSQL·Redis 필요 (docker compose up -d).
 * 로그인은 MockSocialVerifier를 사용한다(idToken = socialId).
 */
describe('Interviews (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;

  async function createSession(
    overrides: Record<string, unknown> = {},
  ): Promise<CreateBody> {
    const res = await request(app.getHttpServer())
      .post('/v1/interviews')
      .set('Authorization', `Bearer ${token}`)
      .send({
        jobSource: 'paste',
        jobPostingText: '주요 업무: 결제 서버 API 개발 및 운영',
        applicantInfo: '경력 3년, 백엔드',
        interviewType: 'general',
        difficulty: 'mid',
        questionCount: QUESTION_COUNT,
        ...overrides,
      })
      .expect(201);
    return res.body as CreateBody;
  }

  /** SSE 응답 본문에서 이벤트 이름만 순서대로 뽑는다. */
  function eventNames(streamBody: string): string[] {
    return streamBody
      .split('\n')
      .filter((line) => line.startsWith('event: '))
      .map((line) => line.replace('event: ', '').trim());
  }

  async function answer(sessionId: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/v1/interviews/${sessionId}/answer`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: ANSWER })
      .expect(200);
    return res.text;
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

    const login = await request(app.getHttpServer())
      .post('/v1/auth/login/kakao')
      .send({ idToken: `interview-e2e-${Date.now()}` })
      .expect(200);
    token = (login.body as TokenBody).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('세션을 만들면 첫 질문과 진행도를 돌려준다', async () => {
    const body = await createSession();

    expect(body.status).toBe('in_progress');
    // 첫 질문은 도입 질문이라 진행도는 아직 0이다.
    expect(body.progress).toEqual({ current: 0, total: QUESTION_COUNT });
    expect(body.firstQuestion.seq).toBe(1);
    expect(body.firstQuestion.type).toBe('intro_question');
    expect(body.firstQuestion.content).toBeTruthy();
  });

  it('공고 본문 없이 붙여넣기로 만들면 422', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/interviews')
      .set('Authorization', `Bearer ${token}`)
      .send({
        jobSource: 'paste',
        interviewType: 'general',
        difficulty: 'mid',
        questionCount: QUESTION_COUNT,
      })
      .expect(422);

    expect((res.body as ErrorBody).error.code).toBe('JOB_POSTING_REQUIRED');
  });

  it('인증 없이 접근하면 401', async () => {
    await request(app.getHttpServer()).get('/v1/interviews').expect(401);
  });

  it('답변을 제출하면 SSE로 다음 발화를 흘려준다', async () => {
    const created = await createSession();
    const stream = await answer(created.sessionId);
    const events = eventNames(stream);

    expect(events).toContain('message.delta');
    expect(events[events.length - 1]).toBe('message.done');
    expect(stream).toContain('"progress"');
  });

  it('스킵하면 미응답으로 넘어가고, 마지막 질문 뒤에는 done=true가 된다', async () => {
    const created = await createSession();

    let last: SkipBody | null = null;
    // 도입 질문까지 모두 넘겨야 종료에 닿는다.
    for (let i = 0; i < INTRO_QUESTION_COUNT + QUESTION_COUNT; i += 1) {
      const res = await request(app.getHttpServer())
        .post(`/v1/interviews/${created.sessionId}/skip`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      last = res.body as SkipBody;
    }

    expect(last?.done).toBe(true);
    expect(last?.next).toBeNull();
    expect(last?.progress).toEqual({
      current: QUESTION_COUNT,
      total: QUESTION_COUNT,
    });
  });

  it('일시정지 중에는 답변할 수 없고, 이어하기 후 진행된다', async () => {
    const created = await createSession();

    await request(app.getHttpServer())
      .post(`/v1/interviews/${created.sessionId}/pause`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect({ status: 'paused' });

    const conflict = await request(app.getHttpServer())
      .post(`/v1/interviews/${created.sessionId}/answer`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: ANSWER })
      .expect(409);
    expect((conflict.body as ErrorBody).error.code).toBe('SESSION_PAUSED');

    const resumed = await request(app.getHttpServer())
      .post(`/v1/interviews/${created.sessionId}/resume`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect((resumed.body as { status: string }).status).toBe('in_progress');
    await answer(created.sessionId);
  });

  it('면접을 끝내면 가중치 리포트가 생성되고 재열람·목록에 반영된다', async () => {
    const created = await createSession();
    // 모범답안은 직무 질문에만 붙으므로 도입 질문을 먼저 넘긴다 (ADR 0006).
    for (let i = 0; i < INTRO_QUESTION_COUNT; i += 1) {
      await request(app.getHttpServer())
        .post(`/v1/interviews/${created.sessionId}/skip`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    }
    await answer(created.sessionId);

    const completed = await request(app.getHttpServer())
      .post(`/v1/interviews/${created.sessionId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const report = (completed.body as { report: ReportBody }).report;
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
    expect(['pass', 'fail']).toContain(report.passResult);
    expect(report.scores).toHaveLength(4);

    // 종합 점수는 서버가 항목 점수 × 가중치로 재계산한다.
    const recomputed = Math.round(
      report.scores.reduce((sum, s) => sum + s.score * s.weight, 0),
    );
    expect(recomputed).toBe(report.overallScore);

    // 종료된 면접에는 답변할 수 없다.
    const conflict = await request(app.getHttpServer())
      .post(`/v1/interviews/${created.sessionId}/answer`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: ANSWER })
      .expect(409);
    expect((conflict.body as ErrorBody).error.code).toBe('SESSION_COMPLETED');

    const detail = await request(app.getHttpServer())
      .get(`/v1/interviews/${created.sessionId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const detailBody = detail.body as {
      session: { status: string };
      messages: { type: string; feedback?: { modelAnswer: string | null } }[];
      report: ReportBody | null;
    };
    expect(detailBody.session.status).toBe('completed');
    expect(detailBody.report?.overallScore).toBe(report.overallScore);
    const withModelAnswer = detailBody.messages.filter(
      (message) => message.feedback?.modelAnswer,
    );
    expect(withModelAnswer.length).toBeGreaterThan(0);

    const list = await request(app.getHttpServer())
      .get('/v1/interviews?limit=5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const listBody = list.body as {
      items: { id: string; score: number | null }[];
      nextCursor: string | null;
    };
    const found = listBody.items.find((item) => item.id === created.sessionId);
    expect(found?.score).toBe(report.overallScore);
  });

  it('리포트 만족도를 남기고 재열람 시 복원된다', async () => {
    const created = await createSession();
    await answer(created.sessionId);
    await request(app.getHttpServer())
      .post(`/v1/interviews/${created.sessionId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const up = await request(app.getHttpServer())
      .post(`/v1/interviews/${created.sessionId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 'up' })
      .expect(200);
    expect(up.body).toEqual({ rating: 'up', comment: null });

    // 마음이 바뀌어 다시 남기면 갱신된다.
    await request(app.getHttpServer())
      .post(`/v1/interviews/${created.sessionId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 'down', comment: '점수 근거가 약해요' })
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/v1/interviews/${created.sessionId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect((detail.body as { feedback: unknown }).feedback).toEqual({
      rating: 'down',
      comment: '점수 근거가 약해요',
    });
  });

  it('끝나지 않은 면접에는 만족도를 남길 수 없다(409)', async () => {
    const created = await createSession();

    const res = await request(app.getHttpServer())
      .post(`/v1/interviews/${created.sessionId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 'up' })
      .expect(409);

    expect((res.body as ErrorBody).error.code).toBe('SESSION_NOT_COMPLETED');
  });

  it('rating 값이 잘못되면 400', async () => {
    const created = await createSession();

    await request(app.getHttpServer())
      .post(`/v1/interviews/${created.sessionId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 'maybe' })
      .expect(400);
  });

  it('목록에 세션 상태가 담겨 이어하기를 판단할 수 있다', async () => {
    const created = await createSession();

    const listing = await request(app.getHttpServer())
      .get('/v1/interviews?limit=20')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const found = (
      listing.body as { items: { id: string; status: string }[] }
    ).items.find((item) => item.id === created.sessionId);
    expect(found?.status).toBe('in_progress');

    // 종료하면 목록 상태도 바뀐다.
    await answer(created.sessionId);
    await request(app.getHttpServer())
      .post(`/v1/interviews/${created.sessionId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/v1/interviews?limit=20')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const completed = (
      after.body as { items: { id: string; status: string }[] }
    ).items.find((item) => item.id === created.sessionId);
    expect(completed?.status).toBe('completed');
  });

  it('남의 면접에는 접근할 수 없다(403)', async () => {
    const created = await createSession();

    const other = await request(app.getHttpServer())
      .post('/v1/auth/login/kakao')
      .send({ idToken: `interview-e2e-other-${Date.now()}` })
      .expect(200);
    const otherToken = (other.body as TokenBody).accessToken;

    const res = await request(app.getHttpServer())
      .get(`/v1/interviews/${created.sessionId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);

    expect((res.body as ErrorBody).error.code).toBe('INTERVIEW_FORBIDDEN');
  });
});
