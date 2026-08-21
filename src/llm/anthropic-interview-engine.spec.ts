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

  function build(): AnthropicInterviewEngine {
    const config = {
      get: (key: string) => (key === 'LLM_API_KEY' ? 'sk-ant-test' : undefined),
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
        .mockResolvedValueOnce(messageWith({ introQuestions: 'wrong' }))
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
});
