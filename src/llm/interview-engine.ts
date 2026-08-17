import { Criterion, CriterionWeights } from './weight-presets';

/**
 * 면접 진행·평가에 필요한 LLM 호출의 포트(port).
 *
 * 마일스톤 1(세션·메시지 API)은 결정적(deterministic) 스텁 어댑터로 흐름을 완성하고,
 * 마일스톤 2(LLM 파이프라인)에서 실제 LLM 어댑터로 교체한다.
 * 프롬프트·출력 스키마는 `docs/Pacer_AI프롬프트설계_v1.md`를 따른다.
 */
export const INTERVIEW_ENGINE = 'INTERVIEW_ENGINE';

/** 세션 생성 시 기본 질문 N개 일괄 생성 컨텍스트 (프롬프트 설계 §3). */
export interface QuestionSetContext {
  jobPostingText: string | null;
  applicantInfo: string | null;
  jobCategory: string | null;
  jobRole: string | null;
  interviewType: string;
  difficulty: string;
  language: string;
  questionCount: number;
}

export interface GeneratedQuestion {
  /** 질문 플랜 내 순번 (1..questionCount). 메시지 seq와는 별개. */
  order: number;
  content: string;
  intent?: string;
}

/** 답변 제출 시 다음 발화 결정 컨텍스트 (프롬프트 설계 §4). */
export interface NextTurnContext {
  baseQuestion: string;
  userAnswer: string;
  followUpDepth: number;
  maxFollowUp: number;
  interviewType: string;
  difficulty: string;
}

export type NextTurnDecision =
  | { action: 'follow_up'; content: string; reason?: string }
  | { action: 'next'; reason?: string };

export interface TranscriptTurn {
  seq: number;
  role: string;
  type: string;
  content: string | null;
}

/** 최종 평가 컨텍스트 (프롬프트 설계 §6). */
export interface EvaluationContext {
  transcript: TranscriptTurn[];
  baseQuestions: { seq: number; content: string }[];
  jobCategory: string | null;
  jobRole: string | null;
  difficulty: string;
  weightPreset: string;
  weights: CriterionWeights;
}

export interface CriterionScore {
  criterion: Criterion;
  score: number;
  comment?: string;
}

export interface ModelAnswer {
  /** 대상 기본 질문의 메시지 seq */
  questionSeq: number;
  modelAnswer: string;
}

export interface InterviewEvaluation {
  passResult: 'pass' | 'fail';
  passReason: string;
  scores: CriterionScore[];
  modelAnswers: ModelAnswer[];
}

export interface InterviewEngine {
  generateQuestions(ctx: QuestionSetContext): Promise<GeneratedQuestion[]>;
  decideNextTurn(ctx: NextTurnContext): Promise<NextTurnDecision>;
  evaluate(ctx: EvaluationContext): Promise<InterviewEvaluation>;
}
