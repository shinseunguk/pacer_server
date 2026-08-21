import { z } from 'zod';
import { CRITERIA } from './weight-presets';

/**
 * LLM 출력 계약 (`docs/Pacer_AI프롬프트설계_v1.md` §8).
 *
 * structured outputs로 API 레벨에서 형식을 강제하고, **서버에서 zod로 한 번 더 검증**한다.
 * 모델·SDK가 바뀌어도 잘못된 값이 도메인으로 새어들지 않게 하는 방어선이다.
 */

const questionItem = z.object({
  seq: z.number().int().min(1),
  content: z.string().min(1),
  intent: z.string().optional(),
});

export const questionSetSchema = z.object({
  introQuestions: z.array(questionItem),
  questions: z.array(questionItem),
});

export type QuestionSetOutput = z.infer<typeof questionSetSchema>;

export const nextTurnSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('follow_up'),
    content: z.string().min(1),
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal('next'),
    reason: z.string().optional(),
  }),
]);

export type NextTurnOutput = z.infer<typeof nextTurnSchema>;

export const evaluationSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  passResult: z.enum(['pass', 'fail']),
  passReason: z.string().min(1),
  scores: z.array(
    z.object({
      criterion: z.enum(CRITERIA),
      score: z.number().int().min(0).max(100),
      comment: z.string().optional(),
    }),
  ),
  modelAnswers: z.array(
    z.object({
      questionSeq: z.number().int().min(1),
      modelAnswer: z.string().min(1),
    }),
  ),
});

export type EvaluationOutput = z.infer<typeof evaluationSchema>;

/**
 * Anthropic structured outputs용 JSON Schema.
 *
 * zod 스키마와 **따로 손으로 적는다.** 자동 변환을 쓰면 zod의 표현력(refine 등)이
 * JSON Schema로 넘어가지 않는 지점에서 조용히 어긋난다. 두 벌을 두되 검증은 zod가 한다.
 *
 * structured outputs는 integer의 `minimum`/`maximum`을 지원하지 않아 400을 낸다.
 * 범위 검증은 zod에 남겨 두고 여기서는 형태만 강제한다 — 두 벌을 둔 값이 여기서 나온다.
 */
const questionItemJson = {
  type: 'object',
  properties: {
    seq: { type: 'integer' },
    content: { type: 'string' },
    intent: { type: 'string' },
  },
  required: ['seq', 'content'],
  additionalProperties: false,
} as const;

export const questionSetJsonSchema = {
  type: 'object',
  properties: {
    introQuestions: { type: 'array', items: questionItemJson },
    questions: { type: 'array', items: questionItemJson },
  },
  required: ['introQuestions', 'questions'],
  additionalProperties: false,
} as const;

export const nextTurnJsonSchema = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['follow_up', 'next'] },
    content: { type: 'string' },
    reason: { type: 'string' },
  },
  required: ['action'],
  additionalProperties: false,
} as const;

export const evaluationJsonSchema = {
  type: 'object',
  properties: {
    overallScore: { type: 'integer' },
    passResult: { type: 'string', enum: ['pass', 'fail'] },
    passReason: { type: 'string' },
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          criterion: { type: 'string', enum: [...CRITERIA] },
          score: { type: 'integer' },
          comment: { type: 'string' },
        },
        required: ['criterion', 'score'],
        additionalProperties: false,
      },
    },
    modelAnswers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          questionSeq: { type: 'integer' },
          modelAnswer: { type: 'string' },
        },
        required: ['questionSeq', 'modelAnswer'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'overallScore',
    'passResult',
    'passReason',
    'scores',
    'modelAnswers',
  ],
  additionalProperties: false,
} as const;
