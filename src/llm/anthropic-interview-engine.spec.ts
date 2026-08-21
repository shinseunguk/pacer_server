import { ConfigService } from '@nestjs/config';
import { AnthropicInterviewEngine } from './anthropic-interview-engine';
import { LlmUsageService } from './llm-usage.service';

interface FakeMessage {
  model: string;
  content: { type: string; text: string }[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

function messageWith(payload: unknown): FakeMessage {
  return {
    model: 'claude-opus-5',
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    usage: {
      input_tokens: 1200,
      output_tokens: 300,
      cache_read_input_tokens: 500,
      cache_creation_input_tokens: 0,
    },
  };
}

const questionSetPayload = {
  company: '빗썸',
  roleTitle: 'iOS 개발자',
  introQuestions: [
    { seq: 1, content: '자기소개 부탁드립니다.', intent: '도입' },
    { seq: 2, content: '지원 이유를 말씀해주세요.', intent: '지원동기' },
  ],
  questions: [
    { seq: 1, content: '결제 API 지연을 줄인 경험은?' },
    { seq: 2, content: '인덱스를 고른 근거는?' },
    { seq: 3, content: '장애 대응 경험은?' },
  ],
};

const questionCtx = {
  sessionId: 'session-1',
  jobPostingText: '결제 서버 API 개발',
  applicantInfo: '경력 3년',
  jobCategory: '개발',
  jobRole: '백엔드',
  interviewType: 'general',
  difficulty: 'mid',
  language: 'ko',
  questionCount: 3,
};

describe('AnthropicInterviewEngine', () => {
  let create: jest.Mock;
  let usage: { record: jest.Mock };
  let engine: AnthropicInterviewEngine;

  function build(env: Record<string, string> = {}): AnthropicInterviewEngine {
    const config = {
      get: (key: string) => (key === 'LLM_API_KEY' ? 'sk-ant-test' : env[key]),
    } as unknown as ConfigService;

    const instance = new AnthropicInterviewEngine(
      config,
      usage as unknown as LlmUsageService,
    );
    // SDK 호출만 갈아끼운다 — 프롬프트 조립·검증·기록은 실제 코드가 돈다.
    (
      instance as unknown as { client: { messages: { create: jest.Mock } } }
    ).client = { messages: { create } };
    return instance;
  }

  beforeEach(() => {
    create = jest.fn();
    usage = { record: jest.fn().mockResolvedValue(undefined) };
    engine = build();
  });

  describe('generateQuestions', () => {
    it('도입 질문과 직무 질문을 종류별로 나눠 돌려준다', async () => {
      create.mockResolvedValue(messageWith(questionSetPayload));

      const set = await engine.generateQuestions(questionCtx);

      expect(set.introQuestions).toHaveLength(2);
      expect(set.introQuestions[0].kind).toBe('intro_question');
      expect(set.questions).toHaveLength(3);
      expect(set.questions[0].kind).toBe('base_question');
    });

    it('공고에서 읽어낸 회사와 직무를 따로 돌려준다', async () => {
      // 붙여서 주면 사용자가 직무를 직접 고른 순간 회사까지 사라진다 (#41).
      create.mockResolvedValue(messageWith(questionSetPayload));

      const set = await engine.generateQuestions(questionCtx);

      expect(set.company).toBe('빗썸');
      expect(set.roleTitle).toBe('iOS 개발자');
    });

    it.each([
      ['빈 문자열', ''],
      ['공백뿐', '   '],
      ['공고 제목을 통째로 옮긴 경우', '가'.repeat(21)],
    ])('이름이 %s이면 없는 것으로 둔다', async (_case, value) => {
      // 이력 한 줄에 안 들어가는 값은 없느니만 못하다. '직무 미지정'으로 떨어진다.
      create.mockResolvedValue(
        messageWith({
          ...questionSetPayload,
          company: value,
          roleTitle: value,
        }),
      );

      const set = await engine.generateQuestions(questionCtx);

      expect(set.company).toBeNull();
      expect(set.roleTitle).toBeNull();
    });

    it('이름 안의 줄바꿈은 한 줄로 접는다', async () => {
      create.mockResolvedValue(
        messageWith({ ...questionSetPayload, roleTitle: 'iOS\n 개발자' }),
      );

      const set = await engine.generateQuestions(questionCtx);

      expect(set.roleTitle).toBe('iOS 개발자');
    });

    it('모델이 요청보다 많이 만들어도 questionCount를 넘기지 않는다', async () => {
      // 문항 수는 사용자와의 계약이다 — 모델 판단에 맡기지 않는다.
      create.mockResolvedValue(
        messageWith({
          ...questionSetPayload,
          questions: [
            ...questionSetPayload.questions,
            { seq: 4, content: '추가 질문' },
            { seq: 5, content: '또 추가' },
          ],
        }),
      );

      const set = await engine.generateQuestions(questionCtx);

      expect(set.questions).toHaveLength(3);
    });

    it('모델이 준 seq를 믿지 않고 순서를 서버가 매긴다', async () => {
      create.mockResolvedValue(
        messageWith({
          company: questionSetPayload.company,
          roleTitle: questionSetPayload.roleTitle,
          introQuestions: questionSetPayload.introQuestions,
          questions: [
            { seq: 99, content: 'A' },
            { seq: 7, content: 'B' },
            { seq: 1, content: 'C' },
          ],
        }),
      );

      const set = await engine.generateQuestions(questionCtx);

      expect(set.questions.map((q) => q.order)).toEqual([1, 2, 3]);
    });

    it('안전 규칙을 맨 앞 블록에 두고 거기에만 캐시를 건다', async () => {
      // 캐시는 프리픽스 기준이다. 가변값이 앞에 섞이면 적중률이 0이 된다.
      create.mockResolvedValue(messageWith(questionSetPayload));

      await engine.generateQuestions(questionCtx);

      const body = (create.mock.calls as unknown[][])[0][0] as {
        system: { text: string; cache_control?: unknown }[];
      };
      expect(body.system[0].text).toContain('[안전 규칙');
      expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('가변값은 캐시되지 않는 뒤 블록에만 담는다', async () => {
      create.mockResolvedValue(messageWith(questionSetPayload));

      await engine.generateQuestions(questionCtx);

      const body = (create.mock.calls as unknown[][])[0][0] as {
        system: { text: string; cache_control?: unknown }[];
      };
      // 프리픽스에는 직무·문항 수가 없어야 한다.
      expect(body.system[0].text).not.toContain('백엔드');
      expect(body.system[0].text).not.toContain('3개');
      expect(body.system[1].text).toContain('백엔드');
      expect(body.system[1].cache_control).toBeUndefined();
    });

    it('Opus 5가 거부하는 파라미터를 보내지 않는다', async () => {
      // temperature·top_p·budget_tokens는 400을 받는다.
      create.mockResolvedValue(messageWith(questionSetPayload));

      await engine.generateQuestions(questionCtx);

      const body = (create.mock.calls as unknown[][])[0][0] as Record<
        string,
        unknown
      >;
      expect(body.temperature).toBeUndefined();
      expect(body.top_p).toBeUndefined();
      expect(body.thinking).toEqual({ type: 'adaptive' });
    });

    it('사용량을 캐시 토큰까지 기록한다', async () => {
      create.mockResolvedValue(messageWith(questionSetPayload));

      await engine.generateQuestions(questionCtx);

      expect(usage.record).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          method: 'generateQuestions',
          model: 'claude-opus-5',
          inputTokens: 1200,
          outputTokens: 300,
          cacheReadTokens: 500,
          isError: false,
        }),
      );
    });
  });

  describe('스키마 검증', () => {
    it('스키마를 어기면 한 번 더 요청한다', async () => {
      create
        .mockResolvedValueOnce(
          messageWith({ company: '', roleTitle: '', introQuestions: 'wrong' }),
        )
        .mockResolvedValueOnce(messageWith(questionSetPayload));

      const set = await engine.generateQuestions(questionCtx);

      expect(create).toHaveBeenCalledTimes(2);
      expect(set.questions).toHaveLength(3);
    });

    it('재요청도 실패하면 한국어 안내로 끝낸다', async () => {
      create.mockResolvedValue(messageWith({ nope: true }));

      await expect(engine.generateQuestions(questionCtx)).rejects.toThrow(
        '답변을 만들지 못했어요. 잠시 후 다시 시도해주세요.',
      );
      expect(create).toHaveBeenCalledTimes(2);
    });

    it('실패한 호출도 사용량에 남긴다 — 토큰은 나갔을 수 있다', async () => {
      create.mockResolvedValue(messageWith({ nope: true }));

      await expect(engine.generateQuestions(questionCtx)).rejects.toThrow();

      expect(usage.record).toHaveBeenCalledWith(
        expect.objectContaining({ isError: true }),
      );
    });
  });

  describe('decideNextTurn', () => {
    const ctx = {
      sessionId: 'session-1',
      baseQuestion: '결제 API 지연을 줄인 경험은?',
      userAnswer: '인덱스를 다시 잡았습니다.',
      followUpDepth: 0,
      maxFollowUp: 2,
      interviewType: 'general',
      difficulty: 'mid',
    };

    it('꼬리질문 결정을 그대로 돌려준다', async () => {
      create.mockResolvedValue(
        messageWith({ action: 'follow_up', content: '근거는?' }),
      );

      const decision = await engine.decideNextTurn(ctx);

      expect(decision).toEqual({ action: 'follow_up', content: '근거는?' });
    });

    it('한도를 넘긴 꼬리질문은 서버가 막는다', async () => {
      // 모델이 한도를 어겨도 대화가 무한히 늘어나면 안 된다.
      create.mockResolvedValue(
        messageWith({ action: 'follow_up', content: '더 파고들기' }),
      );

      const decision = await engine.decideNextTurn({
        ...ctx,
        followUpDepth: 2,
      });

      expect(decision.action).toBe('next');
    });
  });

  describe('evaluate', () => {
    const ctx = {
      sessionId: 'session-1',
      transcript: [
        { seq: 1, role: 'interviewer', type: 'base_question', content: 'Q1' },
        { seq: 2, role: 'user', type: 'answer', content: 'A1' },
      ],
      baseQuestions: [{ seq: 1, content: 'Q1' }],
      jobCategory: '개발',
      jobRole: '백엔드',
      difficulty: 'mid',
      weightPreset: 'developer',
      weights: { logic: 0.25, job_fit: 0.35, structure: 0.2, keyword: 0.2 },
    };

    const payload = {
      overallScore: 78,
      passResult: 'pass',
      passReason: '직무 이해도가 높습니다.',
      scores: [
        { criterion: 'logic', score: 82 },
        { criterion: 'job_fit', score: 75 },
        { criterion: 'structure', score: 68 },
        { criterion: 'keyword', score: 85 },
      ],
      modelAnswers: [
        { questionSeq: 1, modelAnswer: '이렇게 답하면 좋습니다.' },
      ],
    };

    it('평가 결과를 도메인 형태로 돌려준다', async () => {
      create.mockResolvedValue(messageWith(payload));

      const evaluation = await engine.evaluate(ctx);

      expect(evaluation.passResult).toBe('pass');
      expect(evaluation.scores).toHaveLength(4);
      expect(evaluation.modelAnswers).toHaveLength(1);
    });

    it('묻지 않은 질문의 모범답안은 버린다', async () => {
      // 화면은 seq로 질문과 모범답안을 맞춘다 — 없는 seq가 오면 붙을 곳이 없다.
      create.mockResolvedValue(
        messageWith({
          ...payload,
          modelAnswers: [
            { questionSeq: 1, modelAnswer: '정상' },
            { questionSeq: 99, modelAnswer: '없는 질문' },
          ],
        }),
      );

      const evaluation = await engine.evaluate(ctx);

      expect(evaluation.modelAnswers).toEqual([
        { questionSeq: 1, modelAnswer: '정상' },
      ]);
    });

    it('가중치를 시스템 프롬프트에 실어 보낸다', async () => {
      create.mockResolvedValue(messageWith(payload));

      await engine.evaluate(ctx);

      const body = (create.mock.calls as unknown[][])[0][0] as {
        system: { text: string }[];
      };
      expect(body.system[1].text).toContain('job_fit: 0.35');
    });
  });

  describe('메서드별 모델', () => {
    function bodyOf(): Record<string, unknown> {
      return (create.mock.calls as unknown[][])[0][0] as Record<
        string,
        unknown
      >;
    }

    it('지정이 없으면 기본 모델(Opus 5)을 쓴다', async () => {
      create.mockResolvedValue(messageWith(questionSetPayload));

      await engine.generateQuestions(questionCtx);

      expect(bodyOf().model).toBe('claude-opus-5');
    });

    it('decideNextTurn만 기본이 Haiku 4.5다', async () => {
      // 가장 단순한 판단인데 호출이 가장 잦다 — 실측 85% 절감.
      create.mockResolvedValue(messageWith({ action: 'next' }));

      await engine.decideNextTurn({
        sessionId: 's1',
        baseQuestion: 'Q',
        userAnswer: 'A',
        followUpDepth: 0,
        maxFollowUp: 2,
        interviewType: 'general',
        difficulty: 'mid',
      });

      expect(bodyOf().model).toBe('claude-haiku-4-5');
    });

    it('evaluate는 Opus 5를 유지한다 — 평가 일관성이 서비스의 존재 이유다', async () => {
      create.mockResolvedValue(
        messageWith({
          overallScore: 70,
          passResult: 'pass',
          passReason: '근거',
          scores: [{ criterion: 'logic', score: 70 }],
          modelAnswers: [],
        }),
      );

      await engine.evaluate({
        sessionId: 's1',
        transcript: [],
        baseQuestions: [],
        jobCategory: null,
        jobRole: null,
        difficulty: 'mid',
        weightPreset: 'general',
        weights: { logic: 0.25, job_fit: 0.25, structure: 0.25, keyword: 0.25 },
      });

      expect(bodyOf().model).toBe('claude-opus-5');
    });

    it('메서드별 env가 있으면 그 모델을 쓴다', async () => {
      engine = build({ LLM_MODEL_DECIDE_NEXT_TURN: 'claude-haiku-4-5' });
      create.mockResolvedValue(messageWith({ action: 'next' }));

      await engine.decideNextTurn({
        sessionId: 's1',
        baseQuestion: 'Q',
        userAnswer: 'A',
        followUpDepth: 0,
        maxFollowUp: 2,
        interviewType: 'general',
        difficulty: 'mid',
      });

      expect(bodyOf().model).toBe('claude-haiku-4-5');
    });

    it('메서드별 지정이 없으면 LLM_MODEL로 떨어진다', async () => {
      engine = build({ LLM_MODEL: 'claude-sonnet-5' });
      create.mockResolvedValue(messageWith(questionSetPayload));

      await engine.generateQuestions(questionCtx);

      expect(bodyOf().model).toBe('claude-sonnet-5');
    });

    it('adaptive thinking을 지원하지 않는 모델에는 보내지 않는다', async () => {
      // Haiku 4.5는 adaptive thinking을 400으로 거부한다 — 실측 확인.
      engine = build({ LLM_MODEL_GENERATE_QUESTIONS: 'claude-haiku-4-5' });
      create.mockResolvedValue(messageWith(questionSetPayload));

      await engine.generateQuestions(questionCtx);

      expect(bodyOf().thinking).toBeUndefined();
    });

    it('프리픽스가 최소 캐시 길이에 미달하면 캐시를 걸지 않는다', async () => {
      // 걸어봤자 쓰기 요금(1.25배)만 나가고 읽기는 0이다.
      engine = build({ LLM_MODEL_GENERATE_QUESTIONS: 'claude-haiku-4-5' });
      create.mockResolvedValue(messageWith(questionSetPayload));

      await engine.generateQuestions(questionCtx);

      const system = bodyOf().system as { cache_control?: unknown }[];
      expect(system[0].cache_control).toBeUndefined();
    });

    it('최소 길이를 넘는 모델에는 캐시를 건다', async () => {
      create.mockResolvedValue(messageWith(questionSetPayload));

      await engine.generateQuestions(questionCtx);

      const system = bodyOf().system as { cache_control?: unknown }[];
      expect(system[0].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('사용량은 실제로 쓴 모델로 기록한다', async () => {
      engine = build({ LLM_MODEL_GENERATE_QUESTIONS: 'claude-haiku-4-5' });
      create.mockResolvedValue({
        ...messageWith(questionSetPayload),
        model: 'claude-haiku-4-5',
      });

      await engine.generateQuestions(questionCtx);

      expect(usage.record).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-haiku-4-5' }),
      );
    });
  });
});
