import { Injectable, Logger } from '@nestjs/common';
import {
  EvaluationContext,
  GeneratedQuestion,
  InterviewEngine,
  InterviewEvaluation,
  NextTurnContext,
  NextTurnDecision,
  QuestionSetContext,
} from './interview-engine';
import { clampScore, CRITERIA } from './weight-presets';

/**
 * 마일스톤 1용 결정적 스텁 엔진.
 * 세션·메시지 API 흐름(생성 → 답변 → 꼬리질문 → 평가)을 LLM 없이 끝까지 돌리기 위한 임시 구현이며,
 * 마일스톤 2에서 실제 LLM 어댑터로 교체한다. 같은 입력에는 항상 같은 출력을 낸다.
 */
@Injectable()
export class StubInterviewEngine implements InterviewEngine {
  private readonly logger = new Logger(StubInterviewEngine.name);

  generateQuestions(ctx: QuestionSetContext): Promise<GeneratedQuestion[]> {
    this.logger.warn(
      'StubInterviewEngine으로 질문을 생성합니다 (마일스톤 2에서 LLM으로 교체).',
    );

    const pool = this.questionPool(ctx);
    const questions = Array.from({ length: ctx.questionCount }, (_, index) => ({
      order: index + 1,
      content: this.applyTone(pool[index % pool.length], ctx.interviewType),
      intent: index === 0 ? '도입·기본 파악' : '직무 역량 확인',
    }));

    return Promise.resolve(questions);
  }

  decideNextTurn(ctx: NextTurnContext): Promise<NextTurnDecision> {
    if (ctx.followUpDepth >= ctx.maxFollowUp) {
      return Promise.resolve({ action: 'next', reason: '꼬리질문 한도 도달' });
    }

    if (this.isShallow(ctx.userAnswer)) {
      return Promise.resolve({
        action: 'next',
        reason: '더 파고들 근거가 부족함',
      });
    }

    if (this.isThorough(ctx.userAnswer)) {
      return Promise.resolve({
        action: 'next',
        reason: '핵심을 충분히 설명함',
      });
    }

    return Promise.resolve({
      action: 'follow_up',
      content: this.applyTone(
        '방금 말씀하신 부분에서 본인이 직접 결정한 지점과 그 근거를 조금 더 구체적으로 설명해주시겠어요?',
        ctx.interviewType,
      ),
      reason: '구현·판단 깊이 확인 필요',
    });
  }

  evaluate(ctx: EvaluationContext): Promise<InterviewEvaluation> {
    const answers = ctx.transcript.filter((turn) => turn.type === 'answer');
    const skipped = ctx.transcript.filter((turn) => turn.type === 'skip');

    const answeredRatio =
      ctx.baseQuestions.length === 0
        ? 0
        : answers.length / (answers.length + skipped.length || 1);
    const avgLength = this.averageLength(answers.map((a) => a.content ?? ''));

    // 답변 충실도(길이)와 응답률만 보는 임시 휴리스틱.
    const base = clampScore(
      40 + answeredRatio * 30 + Math.min(avgLength, 400) / 20,
    );

    const scores = CRITERIA.map((criterion, index) => ({
      criterion,
      // 항목마다 살짝 다른 값을 주어 리포트 화면(레이더)이 평평해지지 않게 한다.
      score: clampScore(base + (index % 2 === 0 ? 3 : -3)),
      comment: '임시 평가 엔진의 값입니다 (LLM 연동 후 대체).',
    }));

    const passResult = base >= PASS_THRESHOLD ? 'pass' : 'fail';

    return Promise.resolve({
      passResult,
      passReason:
        passResult === 'pass'
          ? '질문 대부분에 구체적인 근거를 들어 답변했습니다. 답변 구조를 STAR로 다듬으면 설득력이 더 올라갑니다.'
          : '답변이 짧거나 미응답이 많아 직무 역량을 확인하기 어려웠습니다. 경험을 상황·행동·결과 순으로 정리해보세요.',
      scores,
      modelAnswers: ctx.baseQuestions.map((question) => ({
        questionSeq: question.seq,
        modelAnswer: `"${this.summarize(question.content)}" 질문에는 상황(S)·과제(T)·행동(A)·결과(R) 순으로, 수치로 확인 가능한 결과를 덧붙여 답하는 것이 좋습니다.`,
      })),
    });
  }

  private questionPool(ctx: QuestionSetContext): string[] {
    const role = ctx.jobRole ?? ctx.jobCategory ?? '지원 직무';
    const pool = [
      '자기소개 부탁드립니다.',
      `${role} 직무에 지원하신 이유와, 본인이 적합하다고 생각하는 근거를 말씀해주세요.`,
      `${role} 업무에서 가장 어려웠던 문제와 해결 과정을 구체적으로 설명해주세요.`,
      '협업 과정에서 의견이 충돌했을 때 어떻게 조율했는지 사례를 들어 말씀해주세요.',
      '최근 3년 내 성과 중 수치로 설명할 수 있는 것을 하나 골라 설명해주세요.',
    ];

    if (ctx.jobPostingText) {
      pool.push(
        '공고의 주요 업무 중 본인의 강점과 가장 맞닿아 있는 항목은 무엇이고, 그렇게 판단한 근거는 무엇인가요?',
      );
    }
    if (ctx.applicantInfo) {
      pool.push(
        '작성해주신 경력 중 가장 몰입했던 프로젝트에서 본인의 기여를 역할 단위로 나눠 설명해주세요.',
      );
    }
    if (ctx.difficulty === 'high') {
      pool.push(
        '그 선택이 실패했다면 어떤 지표로 가장 먼저 알아챌 수 있었을까요? 대안은 무엇이었나요?',
      );
    }

    return pool;
  }

  /** 압박 유형은 톤만 집요하게. 인격 비하는 하지 않는다(가드레일 §2). */
  private applyTone(content: string, interviewType: string): string {
    if (interviewType !== 'pressure') return content;
    return `${content} 근거가 되는 수치나 사실을 함께 제시해주세요.`;
  }

  private isShallow(answer: string): boolean {
    const trimmed = answer.trim();
    if (trimmed.length < SHALLOW_ANSWER_LENGTH) return true;
    return ['모르겠', '잘 모르', '기억이 안'].some((mark) =>
      trimmed.includes(mark),
    );
  }

  private isThorough(answer: string): boolean {
    return answer.trim().length >= THOROUGH_ANSWER_LENGTH;
  }

  private averageLength(texts: string[]): number {
    if (texts.length === 0) return 0;
    const total = texts.reduce((sum, text) => sum + text.trim().length, 0);
    return total / texts.length;
  }

  private summarize(text: string): string {
    return text.length <= SUMMARY_LENGTH
      ? text
      : `${text.slice(0, SUMMARY_LENGTH)}…`;
  }
}

const PASS_THRESHOLD = 70;
const SHALLOW_ANSWER_LENGTH = 30;
const THOROUGH_ANSWER_LENGTH = 200;
const SUMMARY_LENGTH = 24;
