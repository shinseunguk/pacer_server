import Anthropic from '@anthropic-ai/sdk';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZodType } from 'zod';
import { AppException } from '../common/exceptions/app.exception';
import { LlmMethod } from './entities/llm-usage.entity';
import {
  EvaluationContext,
  GeneratedQuestion,
  GeneratedQuestionSet,
  InterviewEngine,
  InterviewEvaluation,
  NextTurnContext,
  NextTurnDecision,
  QuestionSetContext,
} from './interview-engine';
import { LlmUsageService } from './llm-usage.service';
import {
  evaluationJsonSchema,
  evaluationSchema,
  nextTurnJsonSchema,
  nextTurnSchema,
  questionSetJsonSchema,
  questionSetSchema,
} from './output-schemas';
import {
  evaluationPrefix,
  evaluationSystem,
  evaluationUser,
  nextTurnPrefix,
  nextTurnSystem,
  nextTurnUser,
  questionSetPrefix,
  questionSetSystem,
  questionSetUser,
} from './prompts';
import { clampScore } from './weight-presets';

/** 기본 모델 — Phase A는 Opus 5로 기준선을 잡는다 (ADR 0004). */
const DEFAULT_MODEL = 'claude-opus-5';

/**
 * 응답 상한. 15문항 + 모범답안까지 담아야 해서 넉넉히 잡는다.
 * 부족하면 max_tokens에서 잘려 JSON이 깨진다.
 */
const MAX_TOKENS = {
  generateQuestions: 8_000,
  decideNextTurn: 2_000,
  evaluate: 16_000,
} as const;

/**
 * 실패 시 재시도 횟수. structured outputs가 형식을 강제하므로 스키마 위반은 드물지만,
 * 모델·SDK 변경에 대비한 폴백으로 1회만 둔다 (프롬프트 설계 §8).
 */
const RETRY_LIMIT = 1;

/** LLM 호출을 실제로 수행하는 어댑터. 키가 없으면 이 클래스는 주입되지 않는다. */
@Injectable()
export class AnthropicInterviewEngine implements InterviewEngine {
  private readonly logger = new Logger(AnthropicInterviewEngine.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    private readonly usage: LlmUsageService,
  ) {
    this.client = new Anthropic({
      apiKey: this.config.get<string>('LLM_API_KEY'),
    });
    this.model = this.config.get<string>('LLM_MODEL') ?? DEFAULT_MODEL;
  }

  async generateQuestions(
    ctx: QuestionSetContext,
  ): Promise<GeneratedQuestionSet> {
    const output = await this.call({
      method: 'generateQuestions',
      sessionId: ctx.sessionId,
      prefix: questionSetPrefix,
      system: questionSetSystem(ctx),
      user: questionSetUser(ctx),
      maxTokens: MAX_TOKENS.generateQuestions,
      jsonSchema: questionSetJsonSchema,
      schema: questionSetSchema,
    });

    return {
      introQuestions: toQuestions(output.introQuestions, 'intro_question'),
      // 모델이 개수를 어겨도 계약(questionCount)은 서버가 지킨다.
      questions: toQuestions(
        output.questions.slice(0, ctx.questionCount),
        'base_question',
      ),
    };
  }

  async decideNextTurn(ctx: NextTurnContext): Promise<NextTurnDecision> {
    const output = await this.call({
      method: 'decideNextTurn',
      sessionId: ctx.sessionId,
      prefix: nextTurnPrefix,
      system: nextTurnSystem(ctx),
      user: nextTurnUser(ctx),
      maxTokens: MAX_TOKENS.decideNextTurn,
      jsonSchema: nextTurnJsonSchema,
      schema: nextTurnSchema,
    });

    // 한도를 넘긴 꼬리질문은 서버가 막는다 — 모델 판단에 맡기지 않는다.
    if (output.action === 'follow_up' && ctx.followUpDepth >= ctx.maxFollowUp) {
      return { action: 'next', reason: '꼬리질문 한도 도달' };
    }
    return output;
  }

  async evaluate(ctx: EvaluationContext): Promise<InterviewEvaluation> {
    const output = await this.call({
      method: 'evaluate',
      sessionId: ctx.sessionId,
      prefix: evaluationPrefix,
      system: evaluationSystem(ctx),
      user: evaluationUser(ctx),
      maxTokens: MAX_TOKENS.evaluate,
      jsonSchema: evaluationJsonSchema,
      schema: evaluationSchema,
    });

    const askedSeqs = new Set(ctx.baseQuestions.map((q) => q.seq));

    return {
      passResult: output.passResult,
      passReason: output.passReason,
      scores: output.scores.map((score) => ({
        criterion: score.criterion,
        score: clampScore(score.score),
        comment: score.comment,
      })),
      // 묻지 않은 질문의 모범답안이 섞이면 화면에서 매칭되지 않는다.
      modelAnswers: output.modelAnswers.filter((answer) =>
        askedSeqs.has(answer.questionSeq),
      ),
    };
  }

  /**
   * 호출 → structured outputs 파싱 → zod 재검증 → 사용량 기록.
   * 실패해도 토큰은 나가므로 에러 케이스까지 기록한다.
   */
  private async call<T>(params: {
    method: LlmMethod;
    sessionId: string;
    /** 호출마다 동일한 캐시 프리픽스 */
    prefix: string;
    system: string;
    user: string;
    maxTokens: number;
    jsonSchema: object;
    schema: ZodType<T>;
  }): Promise<T> {
    for (let attempt = 0; attempt <= RETRY_LIMIT; attempt += 1) {
      const startedAt = Date.now();
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: params.maxTokens,
          // 캐시는 **프리픽스** 기준이다. 불변 블록을 앞에 두고 거기에만 캐시를 건다.
          // 가변값(직무·문항 수)을 앞에 섞으면 호출마다 프리픽스가 달라져 적중률이 0이 된다.
          system: [
            {
              type: 'text',
              text: params.prefix,
              cache_control: { type: 'ephemeral' },
            },
            { type: 'text', text: params.system },
          ],
          messages: [{ role: 'user', content: params.user }],
          output_config: {
            format: { type: 'json_schema', schema: params.jsonSchema },
          },
          // Opus 5는 temperature·top_p·budget_tokens를 거부한다(400).
          thinking: { type: 'adaptive' },
        } as Anthropic.MessageCreateParamsNonStreaming);

        await this.record(params, response, startedAt, false);
        return params.schema.parse(extractJson(response));
      } catch (error) {
        await this.recordFailure(params, startedAt);

        this.logger.warn(
          `LLM 호출 실패 (method=${params.method}, attempt=${attempt + 1}): ${asMessage(error)}`,
        );
      }
    }

    throw new AppException(
      'LLM_FAILED',
      '답변을 만들지 못했어요. 잠시 후 다시 시도해주세요.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  private record(
    params: { method: LlmMethod; sessionId: string },
    response: Anthropic.Message,
    startedAt: number,
    isError: boolean,
  ): Promise<void> {
    return this.usage.record({
      sessionId: params.sessionId,
      method: params.method,
      model: response.model ?? this.model,
      inputTokens: response.usage.input_tokens,
      // thinking 토큰도 출력으로 과금된다 — SDK가 output_tokens에 합산해 준다.
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      latencyMs: Date.now() - startedAt,
      isError,
    });
  }

  /** 실패한 호출도 토큰은 나갔을 수 있다. 사용량을 0으로 남기되 실패로 표시한다. */
  private recordFailure(
    params: { method: LlmMethod; sessionId: string },
    startedAt: number,
  ): Promise<void> {
    return this.usage.record({
      sessionId: params.sessionId,
      method: params.method,
      model: this.model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - startedAt,
      isError: true,
    });
  }
}

function toQuestions(
  items: { seq: number; content: string; intent?: string }[],
  kind: 'intro_question' | 'base_question',
): GeneratedQuestion[] {
  return items.map((item, index) => ({
    // 모델이 준 seq를 믿지 않는다 — 플랜 순서는 서버가 정한다.
    order: index + 1,
    kind,
    content: item.content,
    intent: item.intent,
  }));
}

/** structured outputs 응답에서 JSON 본문을 꺼낸다. */
function extractJson(response: Anthropic.Message): unknown {
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  if (!text.trim()) {
    throw new Error('빈 응답');
  }
  return JSON.parse(text);
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
