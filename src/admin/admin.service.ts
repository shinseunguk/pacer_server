import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InterviewSession } from '../interviews/entities/interview-session.entity';
import { SessionFeedback } from '../interviews/entities/session-feedback.entity';
import {
  LlmUsageService,
  UsagePeriod,
  UsageSummary,
} from '../llm/llm-usage.service';
import { User } from '../users/entities/user.entity';

/** 문서 `Pacer_LLM비용추정_v1.md`의 면접당 추정 비용(USD). 실측과 대비해 보여준다. */
export const ESTIMATED_COST_PER_SESSION_USD = 0.33;

export interface ServiceMetrics {
  users: number;
  sessions: number;
  completedSessions: number;
  completionRate: number;
  feedbackUp: number;
  feedbackDown: number;
  /** 👍 / (👍 + 👎). 응답이 없으면 0. */
  satisfactionRate: number;
}

export interface CostMetrics extends UsageSummary {
  estimatedCostPerSessionUsd: number;
  /** 실측 ÷ 추정. 1보다 크면 추정이 낙관적이었다는 뜻이다. */
  estimateRatio: number | null;
}

export interface DashboardMetrics {
  period: { from: string; to: string };
  service: ServiceMetrics;
  cost: CostMetrics;
  daily: { date: string; costUsd: number; calls: number }[];
  /** 아직 구현되지 않아 값을 낼 수 없는 패널. 0을 띄우면 실제 0과 구분되지 않는다. */
  unavailable: string[];
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(InterviewSession)
    private readonly sessions: Repository<InterviewSession>,
    @InjectRepository(SessionFeedback)
    private readonly feedbacks: Repository<SessionFeedback>,
    private readonly usage: LlmUsageService,
  ) {}

  async metrics(period: UsagePeriod): Promise<DashboardMetrics> {
    const [service, usageSummary, daily] = await Promise.all([
      this.serviceMetrics(),
      this.usage.summarize(period),
      this.usage.dailyCosts(period),
    ]);

    return {
      period: { from: period.from.toISOString(), to: period.to.toISOString() },
      service,
      cost: {
        ...usageSummary,
        estimatedCostPerSessionUsd: ESTIMATED_COST_PER_SESSION_USD,
        estimateRatio: usageSummary.costPerSessionUsd
          ? Number(
              (
                usageSummary.costPerSessionUsd / ESTIMATED_COST_PER_SESSION_USD
              ).toFixed(3),
            )
          : null,
      },
      daily,
      // 결제 도메인(#24)이 없어 구독 지표는 아직 낼 수 없다.
      unavailable: ['subscriptions'],
    };
  }

  private async serviceMetrics(): Promise<ServiceMetrics> {
    const [users, sessions, completedSessions, feedbackUp, feedbackDown] =
      await Promise.all([
        this.users.count(),
        this.sessions.count(),
        this.sessions.count({ where: { status: 'completed' } }),
        this.feedbacks.count({ where: { rating: 'up' } }),
        this.feedbacks.count({ where: { rating: 'down' } }),
      ]);

    const feedbackTotal = feedbackUp + feedbackDown;

    return {
      users,
      sessions,
      completedSessions,
      completionRate: sessions ? completedSessions / sessions : 0,
      feedbackUp,
      feedbackDown,
      satisfactionRate: feedbackTotal ? feedbackUp / feedbackTotal : 0,
    };
  }
}
