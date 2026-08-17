import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { JobRole } from '../jobs/entities/job-role.entity';
import {
  GeneratedQuestion,
  INTERVIEW_ENGINE,
  InterviewEngine,
  TranscriptTurn,
} from '../llm/interview-engine';
import {
  clampScore,
  computeOverallScore,
  resolveWeightPreset,
  weightsOf,
} from '../llm/weight-presets';
import { UsageService } from '../usage/usage.service';
import { User } from '../users/entities/user.entity';
import { CreateInterviewDto } from './dto/create-interview.dto';
import {
  DEFAULT_LIST_LIMIT,
  ListInterviewsDto,
} from './dto/list-interviews.dto';
import { EvaluationScore } from './entities/evaluation-score.entity';
import { InterviewMessage } from './entities/interview-message.entity';
import { InterviewSession } from './entities/interview-session.entity';
import { MessageFeedback } from './entities/message-feedback.entity';
import { SessionEvaluation } from './entities/session-evaluation.entity';
import { SessionFeedback } from './entities/session-feedback.entity';
import { QuestionPlanStore } from './question-plan.store';
import { FeedbackRating, SubmitFeedbackDto } from './dto/session-feedback.dto';

/** 같은 기본 질문에서 파고들 수 있는 최대 꼬리질문 수 (프롬프트 설계 §4). */
export const MAX_FOLLOW_UP = 2;

/** 이어하기 시 클라이언트에 돌려줄 최근 발화 수. */
const RESUME_CONTEXT_SIZE = 6;

export const SESSION_STATUS = {
  inProgress: 'in_progress',
  paused: 'paused',
  completed: 'completed',
} as const;

export interface Progress {
  current: number;
  total: number;
}

export interface MessageView {
  messageId: string;
  seq: number;
  role: string;
  type: string;
  content: string | null;
  parentId?: string;
}

export interface CreateInterviewResult {
  sessionId: string;
  status: string;
  progress: Progress;
  firstQuestion: MessageView;
}

/** 답변 제출 결과 — 컨트롤러가 SSE 이벤트로 변환한다. */
export type InterviewTurn =
  | { kind: 'message'; message: MessageView; progress: Progress }
  | { kind: 'interview_done'; sessionId: string; progress: Progress };

export interface SkipResult {
  next: MessageView | null;
  progress: Progress;
  /** 남은 기본 질문이 없어 complete로 넘어가야 하는 상태 */
  done: boolean;
}

export interface ResumeResult {
  status: string;
  progress: Progress;
  messages: MessageView[];
}

export interface ReportView {
  overallScore: number;
  showScore: boolean;
  passResult: string;
  passReason: string;
  weightPreset: string;
  scores: { criterion: string; score: number; weight: number }[];
}

export interface CompleteResult {
  sessionId: string;
  status: string;
  report: ReportView;
}

export interface DetailMessageView extends MessageView {
  feedback?: { feedback: string | null; modelAnswer: string | null };
}

/** 리포트 만족도 (MVP 성공 기준 §6). */
export interface SessionFeedbackView {
  rating: FeedbackRating;
  comment: string | null;
}

export interface InterviewDetail {
  session: {
    id: string;
    interviewType: string;
    difficulty: string;
    status: string;
    role: string | null;
    progress: Progress;
    createdAt: Date;
  };
  messages: DetailMessageView[];
  report: ReportView | null;

  /** 내가 이 리포트에 남긴 평가 (없으면 null) */
  feedback: SessionFeedbackView | null;
}

export interface InterviewListItem {
  id: string;
  role: string | null;
  interviewType: string;

  /// 이어하기 진입 여부를 앱이 판단하려면 상태가 필요하다.
  status: string;
  score: number | null;
  passResult: string | null;
  createdAt: Date;
}

export interface InterviewListResult {
  items: InterviewListItem[];
  nextCursor: string | null;
}

@Injectable()
export class InterviewsService {
  constructor(
    @InjectRepository(InterviewSession)
    private readonly sessionRepo: Repository<InterviewSession>,
    @InjectRepository(InterviewMessage)
    private readonly messageRepo: Repository<InterviewMessage>,
    @InjectRepository(SessionEvaluation)
    private readonly evaluationRepo: Repository<SessionEvaluation>,
    @InjectRepository(EvaluationScore)
    private readonly scoreRepo: Repository<EvaluationScore>,
    @InjectRepository(MessageFeedback)
    private readonly feedbackRepo: Repository<MessageFeedback>,
    @InjectRepository(SessionFeedback)
    private readonly sessionFeedbackRepo: Repository<SessionFeedback>,
    @InjectRepository(JobRole)
    private readonly jobRoleRepo: Repository<JobRole>,
    private readonly planStore: QuestionPlanStore,
    private readonly usage: UsageService,
    @Inject(INTERVIEW_ENGINE) private readonly engine: InterviewEngine,
  ) {}

  /** 세션 생성 → 기본 질문 플랜 생성 → 첫 질문 반환. */
  async create(
    userId: string,
    dto: CreateInterviewDto,
  ): Promise<CreateInterviewResult> {
    const jobRole = await this.resolveJobRole(dto);

    const session = await this.sessionRepo.save(
      this.sessionRepo.create({
        user: { id: userId } as User,
        jobRole,
        customRole: dto.customRole ?? null,
        jobSource: dto.jobSource,
        jobPostingText: dto.jobPostingText ?? null,
        applicantInfo: dto.applicantInfo ?? null,
        resumeRef: dto.resumeRef ?? null,
        interviewType: dto.interviewType,
        // 페르소나·실시간 피드백·영어 면접은 P1 (MVP 범위 §3).
        persona: null,
        language: dto.language ?? 'ko',
        difficulty: dto.difficulty,
        questionCount: dto.questionCount,
        realtimeFeedback: false,
        showScore: dto.showScore ?? true,
        status: SESSION_STATUS.inProgress,
      }),
    );

    const [first, ...rest] = await this.generatePlan(session);
    await this.planStore.save(session.id, rest);

    const message = await this.appendMessage(session, 1, {
      role: 'interviewer',
      type: 'base_question',
      content: first.content,
    });
    await this.usage.consumeBaseQuestion(userId);

    return {
      sessionId: session.id,
      status: session.status,
      progress: { current: 1, total: session.questionCount },
      firstQuestion: toMessageView(message),
    };
  }

  /**
   * 답변 저장 → 꼬리질문 / 다음 기본 질문 / 종료 중 하나로 진행.
   * 스트림을 열기 전에 상태 검증이 끝나야 하므로(명세 §8) 모든 판단을 여기서 마친다.
   */
  async submitAnswer(
    userId: string,
    sessionId: string,
    content: string,
  ): Promise<InterviewTurn> {
    const session = await this.loadOwnedSession(userId, sessionId);
    this.assertInProgress(session);

    const messages = await this.loadMessages(sessionId);
    const answer = await this.appendMessage(session, nextSeq(messages), {
      role: 'user',
      type: 'answer',
      content,
    });

    const decision = await this.decideNextTurn(session, messages, content);
    if (decision.action === 'follow_up') {
      const followUp = await this.appendMessage(session, answer.seq + 1, {
        role: 'interviewer',
        type: 'follow_up',
        content: decision.content,
        parent: answer,
      });

      return {
        kind: 'message',
        message: toMessageView(followUp),
        progress: this.progressOf(session, messages),
      };
    }

    return this.advanceToNextQuestion(session, [...messages, answer]);
  }

  /** "모르겠습니다" — 미응답으로 기록하고 다음 기본 질문으로 넘어간다. */
  async skip(userId: string, sessionId: string): Promise<SkipResult> {
    const session = await this.loadOwnedSession(userId, sessionId);
    this.assertInProgress(session);

    const messages = await this.loadMessages(sessionId);
    const skipMessage = await this.appendMessage(session, nextSeq(messages), {
      role: 'user',
      type: 'skip',
      content: null,
    });

    const turn = await this.advanceToNextQuestion(session, [
      ...messages,
      skipMessage,
    ]);

    return turn.kind === 'message'
      ? { next: turn.message, progress: turn.progress, done: false }
      : { next: null, progress: turn.progress, done: true };
  }

  async pause(userId: string, sessionId: string): Promise<{ status: string }> {
    const session = await this.loadOwnedSession(userId, sessionId);
    this.assertInProgress(session);

    session.status = SESSION_STATUS.paused;
    await this.sessionRepo.save(session);

    return { status: session.status };
  }

  /** 이어하기 — 중단 지점 컨텍스트(최근 발화 + 진행도)를 돌려준다. */
  async resume(userId: string, sessionId: string): Promise<ResumeResult> {
    const session = await this.loadOwnedSession(userId, sessionId);

    if (session.status === SESSION_STATUS.completed) {
      throw completedException();
    }

    session.status = SESSION_STATUS.inProgress;
    await this.sessionRepo.save(session);

    const messages = await this.loadMessages(sessionId);
    return {
      status: session.status,
      progress: this.progressOf(session, messages),
      messages: messages.slice(-RESUME_CONTEXT_SIZE).map(toMessageView),
    };
  }

  /** 면접 종료 → 최종 평가 생성. 이미 완료된 세션은 저장된 리포트를 그대로 돌려준다(멱등). */
  async complete(userId: string, sessionId: string): Promise<CompleteResult> {
    const session = await this.loadOwnedSession(userId, sessionId);

    if (session.status === SESSION_STATUS.completed) {
      const report = await this.loadReport(session);
      if (report)
        return { sessionId: session.id, status: session.status, report };
    }

    const messages = await this.loadMessages(sessionId);
    const baseQuestions = messages
      .filter((message) => message.type === 'base_question')
      .map((message) => ({ seq: message.seq, content: message.content ?? '' }));

    const weightPreset = resolveWeightPreset(this.categoryNameOf(session));
    const weights = weightsOf(weightPreset);

    const evaluation = await this.engine.evaluate({
      transcript: messages.map(toTranscriptTurn),
      baseQuestions,
      jobCategory: this.categoryNameOf(session),
      jobRole: session.jobRole?.name ?? session.customRole,
      difficulty: session.difficulty,
      weightPreset,
      weights,
    });

    // LLM이 준 종합 점수를 믿지 않고 가중치로 다시 계산한다 (프롬프트 설계 §9).
    const overallScore = computeOverallScore(evaluation.scores, weights);

    const saved = await this.evaluationRepo.save(
      this.evaluationRepo.create({
        session,
        overallScore,
        passResult: evaluation.passResult,
        passReason: evaluation.passReason,
        weightPreset,
      }),
    );

    await this.scoreRepo.save(
      evaluation.scores.map((score) =>
        this.scoreRepo.create({
          evaluation: saved,
          criterion: score.criterion,
          score: clampScore(score.score),
          weight: String(weights[score.criterion]),
        }),
      ),
    );

    await this.saveModelAnswers(messages, evaluation.modelAnswers);

    session.status = SESSION_STATUS.completed;
    session.finalScore = overallScore;
    session.passResult = evaluation.passResult;
    session.completedAt = new Date();
    await this.sessionRepo.save(session);
    await this.planStore.clear(session.id);

    return {
      sessionId: session.id,
      status: session.status,
      report: {
        overallScore,
        showScore: session.showScore,
        passResult: evaluation.passResult,
        passReason: evaluation.passReason,
        weightPreset,
        scores: evaluation.scores.map((score) => ({
          criterion: score.criterion,
          score: clampScore(score.score),
          weight: weights[score.criterion],
        })),
      },
    };
  }

  /** 대화 전문 재열람 — 메시지 + 피드백/모범답안 + 리포트. */
  async getDetail(userId: string, sessionId: string): Promise<InterviewDetail> {
    const session = await this.loadOwnedSession(userId, sessionId);
    const messages = await this.loadMessages(sessionId);
    const feedbacks = await this.feedbackRepo.find({
      where: { message: { session: { id: sessionId } } },
      relations: { message: true },
    });

    const byMessageId = new Map(
      feedbacks.map((item) => [item.message.id, item]),
    );

    return {
      session: {
        id: session.id,
        interviewType: session.interviewType,
        difficulty: session.difficulty,
        status: session.status,
        role: session.jobRole?.name ?? session.customRole,
        progress: this.progressOf(session, messages),
        createdAt: session.createdAt,
      },
      messages: messages.map((message) => {
        const view: DetailMessageView = toMessageView(message);
        const found = byMessageId.get(message.id);
        if (found) {
          view.feedback = {
            feedback: found.feedback,
            modelAnswer: found.modelAnswer,
          };
        }
        return view;
      }),
      report: await this.loadReport(session),
      feedback: await this.loadFeedback(session.id),
    };
  }

  /**
   * 리포트 만족도 제출 — 같은 세션에 다시 내면 갱신한다(마음이 바뀔 수 있으므로).
   * 평가가 나오기 전에는 남길 것이 없으므로 완료된 면접만 허용한다.
   */
  async submitFeedback(
    userId: string,
    sessionId: string,
    dto: SubmitFeedbackDto,
  ): Promise<SessionFeedbackView> {
    const session = await this.loadOwnedSession(userId, sessionId);

    if (session.status !== SESSION_STATUS.completed) {
      throw new AppException(
        'SESSION_NOT_COMPLETED',
        '면접이 끝난 뒤에 평가할 수 있어요.',
        HttpStatus.CONFLICT,
      );
    }

    const existing = await this.sessionFeedbackRepo.findOne({
      where: { session: { id: sessionId } },
    });
    const comment = dto.comment?.trim();

    const saved = await this.sessionFeedbackRepo.save(
      this.sessionFeedbackRepo.create({
        ...existing,
        session,
        rating: dto.rating,
        comment: comment && comment.length > 0 ? comment : null,
      }),
    );

    return { rating: saved.rating as FeedbackRating, comment: saved.comment };
  }

  private async loadFeedback(
    sessionId: string,
  ): Promise<SessionFeedbackView | null> {
    const feedback = await this.sessionFeedbackRepo.findOne({
      where: { session: { id: sessionId } },
    });
    if (!feedback) return null;

    return {
      rating: feedback.rating as FeedbackRating,
      comment: feedback.comment,
    };
  }

  /** 히스토리 목록 — createdAt 내림차순 커서 페이지네이션. */
  async list(
    userId: string,
    query: ListInterviewsDto,
  ): Promise<InterviewListResult> {
    const limit = query.limit ?? DEFAULT_LIST_LIMIT;
    const createdBefore = await this.resolveCursor(userId, query.cursor);

    const sessions = await this.sessionRepo.find({
      where: {
        user: { id: userId },
        ...(createdBefore ? { createdAt: LessThan(createdBefore) } : {}),
      },
      relations: { jobRole: true },
      order: { createdAt: 'DESC' },
      take: limit + 1,
    });

    const hasMore = sessions.length > limit;
    const items = sessions.slice(0, limit);

    return {
      items: items.map((session) => ({
        id: session.id,
        role: session.jobRole?.name ?? session.customRole,
        interviewType: session.interviewType,
        status: session.status,
        score: session.finalScore,
        passResult: session.passResult,
        createdAt: session.createdAt,
      })),
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  /** 답변/스킵 후 다음 기본 질문으로 이동하거나 종료를 알린다. */
  private async advanceToNextQuestion(
    session: InterviewSession,
    messages: InterviewMessage[],
  ): Promise<InterviewTurn> {
    const askedCount = countBaseQuestions(messages);

    if (askedCount >= session.questionCount) {
      return {
        kind: 'interview_done',
        sessionId: session.id,
        progress: { current: askedCount, total: session.questionCount },
      };
    }

    const question = await this.takeNextQuestion(session, askedCount);
    const message = await this.appendMessage(session, nextSeq(messages), {
      role: 'interviewer',
      type: 'base_question',
      content: question.content,
    });
    // 꼬리질문은 제외하고 기본 질문만 사용량에 반영한다.
    await this.usage.consumeBaseQuestion(session.user.id);

    return {
      kind: 'message',
      message: toMessageView(message),
      progress: { current: askedCount + 1, total: session.questionCount },
    };
  }

  private async decideNextTurn(
    session: InterviewSession,
    messages: InterviewMessage[],
    answer: string,
  ): Promise<{ action: 'next' } | { action: 'follow_up'; content: string }> {
    const baseQuestion = lastBaseQuestion(messages);
    if (!baseQuestion?.content) return { action: 'next' };

    const decision = await this.engine.decideNextTurn({
      baseQuestion: baseQuestion.content,
      userAnswer: answer,
      followUpDepth: countFollowUpsAfter(messages, baseQuestion.seq),
      maxFollowUp: MAX_FOLLOW_UP,
      interviewType: session.interviewType,
      difficulty: session.difficulty,
    });

    if (decision.action === 'follow_up' && decision.content.trim().length > 0) {
      return { action: 'follow_up', content: decision.content };
    }
    return { action: 'next' };
  }

  /**
   * 플랜에서 다음 질문을 꺼낸다.
   * 캐시(TTL 만료 등)로 플랜이 비면 같은 컨텍스트로 다시 생성해 남은 분량만 사용한다.
   */
  private async takeNextQuestion(
    session: InterviewSession,
    askedCount: number,
  ): Promise<GeneratedQuestion> {
    const cached = await this.planStore.get(session.id);
    if (cached && cached.length > 0) {
      const [next, ...rest] = cached;
      await this.planStore.save(session.id, rest);
      return next;
    }

    const regenerated = await this.generatePlan(session);
    const remaining = regenerated.slice(askedCount);
    const [next, ...rest] = remaining.length > 0 ? remaining : regenerated;
    await this.planStore.save(session.id, rest);
    return next;
  }

  private async generatePlan(
    session: InterviewSession,
  ): Promise<GeneratedQuestion[]> {
    const questions = await this.engine.generateQuestions({
      jobPostingText: session.jobPostingText,
      applicantInfo: session.applicantInfo,
      jobCategory: this.categoryNameOf(session),
      jobRole: session.jobRole?.name ?? session.customRole,
      interviewType: session.interviewType,
      difficulty: session.difficulty,
      language: session.language,
      questionCount: session.questionCount,
    });

    if (questions.length === 0) {
      throw new AppException(
        'QUESTION_GENERATION_FAILED',
        '질문을 만들지 못했어요. 잠시 후 다시 시도해주세요.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return questions;
  }

  private async saveModelAnswers(
    messages: InterviewMessage[],
    modelAnswers: { questionSeq: number; modelAnswer: string }[],
  ): Promise<void> {
    const bySeq = new Map(messages.map((message) => [message.seq, message]));

    const rows = modelAnswers
      .map((item) => ({ message: bySeq.get(item.questionSeq), item }))
      .filter(
        (
          row,
        ): row is {
          message: InterviewMessage;
          item: (typeof modelAnswers)[number];
        } => row.message !== undefined,
      )
      .map((row) =>
        this.feedbackRepo.create({
          message: row.message,
          feedback: null,
          modelAnswer: row.item.modelAnswer,
        }),
      );

    if (rows.length > 0) await this.feedbackRepo.save(rows);
  }

  private async loadReport(
    session: InterviewSession,
  ): Promise<ReportView | null> {
    const evaluation = await this.evaluationRepo.findOne({
      where: { session: { id: session.id } },
    });
    if (!evaluation) return null;

    const scores = await this.scoreRepo.find({
      where: { evaluation: { id: evaluation.id } },
    });

    return {
      overallScore: evaluation.overallScore,
      showScore: session.showScore,
      passResult: evaluation.passResult,
      passReason: evaluation.passReason,
      weightPreset: evaluation.weightPreset,
      scores: scores.map((score) => ({
        criterion: score.criterion,
        score: score.score,
        weight: Number(score.weight ?? 0),
      })),
    };
  }

  private async appendMessage(
    session: InterviewSession,
    seq: number,
    data: {
      role: string;
      type: string;
      content: string | null;
      parent?: InterviewMessage;
    },
  ): Promise<InterviewMessage> {
    return this.messageRepo.save(
      this.messageRepo.create({
        session,
        seq,
        role: data.role,
        type: data.type,
        content: data.content,
        parent: data.parent ?? null,
      }),
    );
  }

  private loadMessages(sessionId: string): Promise<InterviewMessage[]> {
    return this.messageRepo.find({
      where: { session: { id: sessionId } },
      relations: { parent: true },
      order: { seq: 'ASC' },
    });
  }

  private async loadOwnedSession(
    userId: string,
    sessionId: string,
  ): Promise<InterviewSession> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      relations: { user: true, jobRole: { category: true } },
    });

    if (!session) {
      throw new AppException(
        'SESSION_NOT_FOUND',
        '면접을 찾을 수 없어요.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (session.user.id !== userId) {
      throw new AppException(
        'INTERVIEW_FORBIDDEN',
        '접근할 수 없는 면접이에요.',
        HttpStatus.FORBIDDEN,
      );
    }

    return session;
  }

  private async resolveJobRole(
    dto: CreateInterviewDto,
  ): Promise<JobRole | null> {
    if (dto.jobSource === 'paste' && !dto.jobPostingText?.trim()) {
      throw new AppException(
        'JOB_POSTING_REQUIRED',
        '공고 내용을 입력해주세요.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (dto.jobSource === 'template' && !dto.jobRoleId) {
      throw new AppException(
        'JOB_ROLE_REQUIRED',
        '직무를 선택해주세요.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // 목록에 없는 직무는 customRole로 직접 입력한다(직무 미선택 허용).
    if (!dto.jobRoleId) return null;

    const jobRole = await this.jobRoleRepo.findOne({
      where: { id: dto.jobRoleId },
      relations: { category: true },
    });

    if (!jobRole) {
      throw new AppException(
        'JOB_ROLE_NOT_FOUND',
        '선택한 직무를 찾을 수 없어요.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return jobRole;
  }

  private async resolveCursor(
    userId: string,
    cursor?: string,
  ): Promise<Date | null> {
    if (!cursor) return null;

    const session = await this.sessionRepo.findOne({
      where: { id: cursor, user: { id: userId } },
    });
    return session?.createdAt ?? null;
  }

  private assertInProgress(session: InterviewSession): void {
    if (session.status === SESSION_STATUS.completed) throw completedException();

    if (session.status === SESSION_STATUS.paused) {
      throw new AppException(
        'SESSION_PAUSED',
        '일시정지된 면접이에요. 이어하기 후 진행해주세요.',
        HttpStatus.CONFLICT,
      );
    }
  }

  private progressOf(
    session: InterviewSession,
    messages: InterviewMessage[],
  ): Progress {
    return {
      current: countBaseQuestions(messages),
      total: session.questionCount,
    };
  }

  private categoryNameOf(session: InterviewSession): string | null {
    return session.jobRole?.category?.name ?? null;
  }
}

function completedException(): AppException {
  return new AppException(
    'SESSION_COMPLETED',
    '이미 종료된 면접이에요.',
    HttpStatus.CONFLICT,
  );
}

function countBaseQuestions(messages: InterviewMessage[]): number {
  return messages.filter((message) => message.type === 'base_question').length;
}

function countFollowUpsAfter(
  messages: InterviewMessage[],
  baseSeq: number,
): number {
  return messages.filter(
    (message) => message.type === 'follow_up' && message.seq > baseSeq,
  ).length;
}

function lastBaseQuestion(
  messages: InterviewMessage[],
): InterviewMessage | undefined {
  return [...messages]
    .reverse()
    .find((message) => message.type === 'base_question');
}

function nextSeq(messages: InterviewMessage[]): number {
  return messages.reduce((max, message) => Math.max(max, message.seq), 0) + 1;
}

function toMessageView(message: InterviewMessage): MessageView {
  return {
    messageId: message.id,
    seq: message.seq,
    role: message.role,
    type: message.type,
    content: message.content,
    ...(message.parent ? { parentId: message.parent.id } : {}),
  };
}

function toTranscriptTurn(message: InterviewMessage): TranscriptTurn {
  return {
    seq: message.seq,
    role: message.role,
    type: message.type,
    content: message.content,
  };
}
