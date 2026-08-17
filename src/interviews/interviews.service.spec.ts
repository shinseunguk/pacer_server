import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { UsageService } from '../usage/usage.service';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { InterviewsService, MAX_FOLLOW_UP } from './interviews.service';
import { QuestionPlanStore } from './question-plan.store';

const USER_ID = 'user-1';
const SESSION_ID = 'session-1';

interface Repo {
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
}

/** save는 id가 없는 엔티티에 순번 id를 붙여 돌려준다(실제 저장 동작 모사). */
function createRepo(prefix: string): Repo {
  let sequence = 0;
  const assignId = (value: Record<string, unknown>): Record<string, unknown> =>
    value.id ? value : { ...value, id: `${prefix}-${++sequence}` };

  return {
    create: jest.fn((v: Record<string, unknown>) => v),
    save: jest.fn((v: Record<string, unknown> | Record<string, unknown>[]) =>
      Promise.resolve(Array.isArray(v) ? v.map(assignId) : assignId(v)),
    ),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  };
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    user: { id: USER_ID },
    jobRole: { name: '백엔드', category: { name: '개발' } },
    customRole: null,
    jobSource: 'paste',
    jobPostingText: '주요 업무: API 개발',
    applicantInfo: null,
    interviewType: 'general',
    difficulty: 'mid',
    language: 'ko',
    questionCount: 3,
    realtimeFeedback: false,
    showScore: true,
    status: 'in_progress',
    finalScore: null,
    passResult: null,
    createdAt: new Date('2026-08-14T00:00:00Z'),
    completedAt: null,
    ...overrides,
  };
}

let messageSeq = 0;
function message(overrides: Record<string, unknown> = {}) {
  messageSeq += 1;
  return {
    id: `msg-${messageSeq}`,
    seq: messageSeq,
    role: 'interviewer',
    type: 'base_question',
    content: '질문입니다.',
    parent: null,
    ...overrides,
  };
}

/** 기본 질문 1개 + 답변 1개로 이루어진 대화 */
function conversation() {
  messageSeq = 0;
  return [
    message({ type: 'base_question', role: 'interviewer' }),
    message({ type: 'answer', role: 'user', content: '이전 답변입니다.' }),
  ];
}

const CREATE_DTO: CreateInterviewDto = {
  jobSource: 'paste',
  jobPostingText: '주요 업무: API 개발',
  interviewType: 'general',
  difficulty: 'mid',
  questionCount: 3,
};

async function expectStatus(
  promise: Promise<unknown>,
  status: HttpStatus,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(AppException);
  await promise.catch((e: AppException) => expect(e.getStatus()).toBe(status));
}

describe('InterviewsService', () => {
  let sessionRepo: Repo;
  let messageRepo: Repo;
  let evaluationRepo: Repo;
  let scoreRepo: Repo;
  let feedbackRepo: Repo;
  let jobRoleRepo: Repo;
  let planStore: { save: jest.Mock; get: jest.Mock; clear: jest.Mock };
  let usage: { consumeBaseQuestion: jest.Mock };
  let engine: {
    generateQuestions: jest.Mock;
    decideNextTurn: jest.Mock;
    evaluate: jest.Mock;
  };
  let service: InterviewsService;

  beforeEach(() => {
    messageSeq = 0;
    sessionRepo = createRepo('session');
    messageRepo = createRepo('msg');
    evaluationRepo = createRepo('eval');
    scoreRepo = createRepo('score');
    feedbackRepo = createRepo('feedback');
    jobRoleRepo = createRepo('role');
    planStore = {
      save: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      clear: jest.fn().mockResolvedValue(undefined),
    };
    usage = { consumeBaseQuestion: jest.fn().mockResolvedValue(1) };
    engine = {
      generateQuestions: jest.fn().mockResolvedValue([
        { order: 1, content: '자기소개 부탁드립니다.' },
        { order: 2, content: '두 번째 질문입니다.' },
        { order: 3, content: '세 번째 질문입니다.' },
      ]),
      decideNextTurn: jest.fn().mockResolvedValue({ action: 'next' }),
      evaluate: jest.fn(),
    };

    service = new InterviewsService(
      sessionRepo as never,
      messageRepo as never,
      evaluationRepo as never,
      scoreRepo as never,
      feedbackRepo as never,
      jobRoleRepo as never,
      planStore as unknown as QuestionPlanStore,
      usage as unknown as UsageService,
      engine,
    );
  });

  describe('create', () => {
    it('세션과 첫 질문을 만들고 남은 질문은 플랜에 보관한다', async () => {
      const result = await service.create(USER_ID, CREATE_DTO);

      expect(result.progress).toEqual({ current: 1, total: 3 });
      expect(result.firstQuestion.seq).toBe(1);
      expect(result.firstQuestion.content).toBe('자기소개 부탁드립니다.');
      expect(planStore.save).toHaveBeenCalledWith(expect.any(String), [
        { order: 2, content: '두 번째 질문입니다.' },
        { order: 3, content: '세 번째 질문입니다.' },
      ]);
      expect(usage.consumeBaseQuestion).toHaveBeenCalledWith(USER_ID);
    });

    it('MVP 제외 항목(페르소나·실시간 피드백)은 꺼진 상태로 저장한다', async () => {
      await service.create(USER_ID, CREATE_DTO);

      expect(sessionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          persona: null,
          realtimeFeedback: false,
          language: 'ko',
          status: 'in_progress',
        }),
      );
    });

    it('공고 붙여넣기인데 본문이 비면 422', async () => {
      await expectStatus(
        service.create(USER_ID, { ...CREATE_DTO, jobPostingText: '   ' }),
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
      expect(sessionRepo.save).not.toHaveBeenCalled();
    });

    it('템플릿 선택인데 직무가 없으면 422', async () => {
      await expectStatus(
        service.create(USER_ID, {
          ...CREATE_DTO,
          jobSource: 'template',
          jobPostingText: undefined,
        }),
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    });

    it('존재하지 않는 직무 id면 422', async () => {
      jobRoleRepo.findOne.mockResolvedValue(null);

      await expectStatus(
        service.create(USER_ID, {
          ...CREATE_DTO,
          jobSource: 'template',
          jobPostingText: undefined,
          jobRoleId: '00000000-0000-0000-0000-000000000000',
        }),
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    });
  });

  describe('submitAnswer', () => {
    beforeEach(() => {
      sessionRepo.findOne.mockResolvedValue(session());
      messageRepo.find.mockResolvedValue(conversation());
    });

    it('꼬리질문 결정이면 진행도를 그대로 두고 사용량도 늘리지 않는다', async () => {
      engine.decideNextTurn.mockResolvedValue({
        action: 'follow_up',
        content: '그 판단의 근거는 무엇이었나요?',
      });

      const turn = await service.submitAnswer(
        USER_ID,
        SESSION_ID,
        '답변입니다',
      );

      expect(turn.kind).toBe('message');
      if (turn.kind !== 'message') return;
      expect(turn.message.type).toBe('follow_up');
      expect(turn.message.parentId).toBeDefined();
      expect(turn.progress).toEqual({ current: 1, total: 3 });
      expect(usage.consumeBaseQuestion).not.toHaveBeenCalled();
    });

    it('다음 결정이면 플랜에서 기본 질문을 꺼내고 사용량을 늘린다', async () => {
      planStore.get.mockResolvedValue([
        { order: 2, content: '두 번째 질문입니다.' },
        { order: 3, content: '세 번째 질문입니다.' },
      ]);

      const turn = await service.submitAnswer(
        USER_ID,
        SESSION_ID,
        '답변입니다',
      );

      expect(turn.kind).toBe('message');
      if (turn.kind !== 'message') return;
      expect(turn.message.type).toBe('base_question');
      expect(turn.message.content).toBe('두 번째 질문입니다.');
      expect(turn.progress).toEqual({ current: 2, total: 3 });
      expect(usage.consumeBaseQuestion).toHaveBeenCalledWith(USER_ID);
      expect(planStore.save).toHaveBeenCalledWith(SESSION_ID, [
        { order: 3, content: '세 번째 질문입니다.' },
      ]);
    });

    it('꼬리질문 한도에 도달하면 엔진에 묻지 않고 다음 질문으로 넘어간다', async () => {
      messageSeq = 0;
      const messages = [
        message({ type: 'base_question' }),
        message({ type: 'answer', role: 'user' }),
        ...Array.from({ length: MAX_FOLLOW_UP }, () =>
          message({ type: 'follow_up' }),
        ),
      ];
      messageRepo.find.mockResolvedValue(messages);
      engine.decideNextTurn.mockResolvedValue({ action: 'next' });

      const turn = await service.submitAnswer(
        USER_ID,
        SESSION_ID,
        '답변입니다',
      );

      expect(engine.decideNextTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          followUpDepth: MAX_FOLLOW_UP,
          maxFollowUp: MAX_FOLLOW_UP,
        }),
      );
      expect(turn.kind).toBe('message');
    });

    it('마지막 기본 질문까지 끝나면 종료 신호를 반환한다', async () => {
      messageSeq = 0;
      messageRepo.find.mockResolvedValue([
        message({ type: 'base_question' }),
        message({ type: 'answer', role: 'user' }),
        message({ type: 'base_question' }),
        message({ type: 'answer', role: 'user' }),
        message({ type: 'base_question' }),
      ]);

      const turn = await service.submitAnswer(
        USER_ID,
        SESSION_ID,
        '답변입니다',
      );

      expect(turn).toEqual({
        kind: 'interview_done',
        sessionId: SESSION_ID,
        progress: { current: 3, total: 3 },
      });
      expect(usage.consumeBaseQuestion).not.toHaveBeenCalled();
    });

    it('플랜 캐시가 비면 다시 생성해 남은 질문을 사용한다', async () => {
      planStore.get.mockResolvedValue(null);

      const turn = await service.submitAnswer(
        USER_ID,
        SESSION_ID,
        '답변입니다',
      );

      expect(engine.generateQuestions).toHaveBeenCalled();
      if (turn.kind !== 'message') throw new Error('기대와 다른 결과');
      expect(turn.message.content).toBe('두 번째 질문입니다.');
    });

    it('일시정지된 면접이면 409', async () => {
      sessionRepo.findOne.mockResolvedValue(session({ status: 'paused' }));

      await expectStatus(
        service.submitAnswer(USER_ID, SESSION_ID, '답변'),
        HttpStatus.CONFLICT,
      );
    });

    it('종료된 면접이면 409', async () => {
      sessionRepo.findOne.mockResolvedValue(session({ status: 'completed' }));

      await expectStatus(
        service.submitAnswer(USER_ID, SESSION_ID, '답변'),
        HttpStatus.CONFLICT,
      );
    });

    it('다른 사용자의 면접이면 403', async () => {
      sessionRepo.findOne.mockResolvedValue(session({ user: { id: 'other' } }));

      await expectStatus(
        service.submitAnswer(USER_ID, SESSION_ID, '답변'),
        HttpStatus.FORBIDDEN,
      );
    });

    it('없는 면접이면 404', async () => {
      sessionRepo.findOne.mockResolvedValue(null);

      await expectStatus(
        service.submitAnswer(USER_ID, SESSION_ID, '답변'),
        HttpStatus.NOT_FOUND,
      );
    });
  });

  describe('skip', () => {
    beforeEach(() => {
      sessionRepo.findOne.mockResolvedValue(session());
    });

    it('미응답을 기록하고 다음 질문을 반환한다', async () => {
      messageRepo.find.mockResolvedValue(conversation());
      planStore.get.mockResolvedValue([
        { order: 2, content: '두 번째 질문입니다.' },
      ]);

      const result = await service.skip(USER_ID, SESSION_ID);

      expect(messageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'skip', content: null }),
      );
      expect(result.done).toBe(false);
      expect(result.next?.content).toBe('두 번째 질문입니다.');
      expect(result.progress).toEqual({ current: 2, total: 3 });
      // 꼬리질문 판단은 하지 않는다.
      expect(engine.decideNextTurn).not.toHaveBeenCalled();
    });

    it('남은 질문이 없으면 done=true로 종료를 알린다', async () => {
      messageSeq = 0;
      messageRepo.find.mockResolvedValue([
        message({ type: 'base_question' }),
        message({ type: 'base_question' }),
        message({ type: 'base_question' }),
      ]);

      const result = await service.skip(USER_ID, SESSION_ID);

      expect(result).toEqual({
        next: null,
        progress: { current: 3, total: 3 },
        done: true,
      });
    });
  });

  describe('pause / resume', () => {
    it('진행 중이면 일시정지된다', async () => {
      sessionRepo.findOne.mockResolvedValue(session());

      await expect(service.pause(USER_ID, SESSION_ID)).resolves.toEqual({
        status: 'paused',
      });
      expect(sessionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'paused' }),
      );
    });

    it('이어하기는 최근 발화와 진행도를 돌려준다', async () => {
      sessionRepo.findOne.mockResolvedValue(session({ status: 'paused' }));
      messageRepo.find.mockResolvedValue(conversation());

      const result = await service.resume(USER_ID, SESSION_ID);

      expect(result.status).toBe('in_progress');
      expect(result.progress).toEqual({ current: 1, total: 3 });
      expect(result.messages).toHaveLength(2);
    });

    it('종료된 면접은 이어할 수 없다(409)', async () => {
      sessionRepo.findOne.mockResolvedValue(session({ status: 'completed' }));

      await expectStatus(
        service.resume(USER_ID, SESSION_ID),
        HttpStatus.CONFLICT,
      );
    });
  });

  describe('complete', () => {
    beforeEach(() => {
      messageSeq = 0;
      messageRepo.find.mockResolvedValue([
        message({ type: 'base_question', content: '자기소개 부탁드립니다.' }),
        message({
          type: 'answer',
          role: 'user',
          content: '3년차 백엔드입니다.',
        }),
      ]);
      engine.evaluate.mockResolvedValue({
        passResult: 'pass',
        passReason: '직무 이해도가 높습니다.',
        scores: [
          { criterion: 'logic', score: 80 },
          { criterion: 'job_fit', score: 60 },
          { criterion: 'structure', score: 40 },
          { criterion: 'keyword', score: 100 },
        ],
        modelAnswers: [{ questionSeq: 1, modelAnswer: '모범답안입니다.' }],
      });
    });

    it('직무 가중치로 종합 점수를 서버가 다시 계산해 저장한다', async () => {
      sessionRepo.findOne.mockResolvedValue(session());

      const result = await service.complete(USER_ID, SESSION_ID);

      // 개발 프리셋: 80×0.2 + 60×0.35 + 40×0.15 + 100×0.3 = 73
      expect(result.report.overallScore).toBe(73);
      expect(result.report.weightPreset).toBe('developer');
      expect(sessionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          finalScore: 73,
          passResult: 'pass',
        }),
      );
      expect(planStore.clear).toHaveBeenCalledWith(SESSION_ID);
    });

    it('모범답안을 해당 기본 질문 메시지에 붙여 저장한다', async () => {
      sessionRepo.findOne.mockResolvedValue(session());

      await service.complete(USER_ID, SESSION_ID);

      expect(feedbackRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({
          modelAnswer: '모범답안입니다.',
          message: expect.objectContaining({ seq: 1 }) as unknown,
        }),
      ]);
    });

    it('직무를 직접 입력했으면 general 프리셋으로 폴백한다', async () => {
      sessionRepo.findOne.mockResolvedValue(
        session({ jobRole: null, customRole: '기타 직무' }),
      );

      const result = await service.complete(USER_ID, SESSION_ID);

      // general 프리셋: (80 + 60 + 40 + 100) × 0.25 = 70
      expect(result.report.weightPreset).toBe('general');
      expect(result.report.overallScore).toBe(70);
    });

    it('이미 종료된 면접은 저장된 리포트를 그대로 돌려준다(멱등)', async () => {
      sessionRepo.findOne.mockResolvedValue(session({ status: 'completed' }));
      evaluationRepo.findOne.mockResolvedValue({
        id: 'eval-1',
        overallScore: 73,
        passResult: 'pass',
        passReason: '직무 이해도가 높습니다.',
        weightPreset: 'developer',
      });
      scoreRepo.find.mockResolvedValue([
        { criterion: 'logic', score: 80, weight: '0.2' },
      ]);

      const result = await service.complete(USER_ID, SESSION_ID);

      expect(result.report.overallScore).toBe(73);
      expect(result.report.scores).toEqual([
        { criterion: 'logic', score: 80, weight: 0.2 },
      ]);
      expect(engine.evaluate).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('limit+1을 조회해 다음 커서를 계산한다', async () => {
      const sessions = [
        session({ id: 's1', finalScore: 80, passResult: 'pass' }),
        session({ id: 's2' }),
        session({ id: 's3' }),
      ];
      sessionRepo.find.mockResolvedValue(sessions);

      const result = await service.list(USER_ID, { limit: 2 });

      expect(sessionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 3 }),
      );
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual(
        expect.objectContaining({ id: 's1', role: '백엔드', score: 80 }),
      );
      expect(result.nextCursor).toBe('s2');
    });

    it('다음 페이지가 없으면 커서는 null이다', async () => {
      sessionRepo.find.mockResolvedValue([session({ id: 's1' })]);

      const result = await service.list(USER_ID, { limit: 2 });

      expect(result.nextCursor).toBeNull();
    });

    it('커서가 남의 세션이면 무시하고 처음부터 조회한다', async () => {
      sessionRepo.findOne.mockResolvedValue(null);
      sessionRepo.find.mockResolvedValue([]);

      await service.list(USER_ID, {
        cursor: '00000000-0000-0000-0000-000000000000',
      });

      expect(sessionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user: { id: USER_ID } },
        }),
      );
    });
  });

  describe('getDetail', () => {
    it('메시지에 모범답안 피드백을 붙여 반환한다', async () => {
      messageSeq = 0;
      const messages = conversation();
      sessionRepo.findOne.mockResolvedValue(session({ status: 'completed' }));
      messageRepo.find.mockResolvedValue(messages);
      feedbackRepo.find.mockResolvedValue([
        {
          message: messages[0],
          feedback: null,
          modelAnswer: '모범답안입니다.',
        },
      ]);
      evaluationRepo.findOne.mockResolvedValue(null);

      const detail = await service.getDetail(USER_ID, SESSION_ID);

      expect(detail.session.role).toBe('백엔드');
      expect(detail.messages[0].feedback).toEqual({
        feedback: null,
        modelAnswer: '모범답안입니다.',
      });
      expect(detail.messages[1].feedback).toBeUndefined();
      expect(detail.report).toBeNull();
    });
  });
});
