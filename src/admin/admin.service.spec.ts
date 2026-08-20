import { Repository } from 'typeorm';
import { InterviewSession } from '../interviews/entities/interview-session.entity';
import { SessionFeedback } from '../interviews/entities/session-feedback.entity';
import { LlmUsageService, UsageSummary } from '../llm/llm-usage.service';
import { User } from '../users/entities/user.entity';
import { AdminService, ESTIMATED_COST_PER_SESSION_USD } from './admin.service';

function emptySummary(overrides: Partial<UsageSummary> = {}): UsageSummary {
  return {
    calls: 0,
    errorCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: 0,
    sessions: 0,
    costPerSessionUsd: 0,
    cacheHitRatio: 0,
    byMethod: [],
    byModel: [],
    ...overrides,
  };
}

describe('AdminService', () => {
  const period = {
    from: new Date('2026-08-01T00:00:00Z'),
    to: new Date('2026-08-31T00:00:00Z'),
  };

  function build(summary: UsageSummary, counts: number[]) {
    const repo = (value: number) =>
      ({ count: jest.fn().mockResolvedValue(value) }) as unknown as Repository<
        User | InterviewSession | SessionFeedback
      >;

    const usage = {
      summarize: jest.fn().mockResolvedValue(summary),
      dailyCosts: jest.fn().mockResolvedValue([]),
    } as unknown as LlmUsageService;

    const [users, sessions, completed, up, down] = counts;
    const sessionRepo = {
      count: jest
        .fn()
        .mockResolvedValueOnce(sessions)
        .mockResolvedValueOnce(completed),
    } as unknown as Repository<InterviewSession>;
    const feedbackRepo = {
      count: jest.fn().mockResolvedValueOnce(up).mockResolvedValueOnce(down),
    } as unknown as Repository<SessionFeedback>;

    return new AdminService(
      repo(users) as Repository<User>,
      sessionRepo,
      feedbackRepo,
      usage,
    );
  }

  it('완료율과 만족도를 비율로 낸다', async () => {
    const service = build(emptySummary(), [10, 8, 6, 3, 1]);

    const metrics = await service.metrics(period);

    expect(metrics.service.completionRate).toBeCloseTo(0.75, 6);
    expect(metrics.service.satisfactionRate).toBeCloseTo(0.75, 6);
  });

  it('면접·피드백이 없어도 0으로 나누지 않는다', async () => {
    const service = build(emptySummary(), [0, 0, 0, 0, 0]);

    const metrics = await service.metrics(period);

    expect(metrics.service.completionRate).toBe(0);
    expect(metrics.service.satisfactionRate).toBe(0);
  });

  it('실측을 추정 비용과 견줘 배수로 보여준다', async () => {
    const service = build(
      emptySummary({ costPerSessionUsd: 0.66, sessions: 2, costUsd: 1.32 }),
      [1, 2, 2, 0, 0],
    );

    const metrics = await service.metrics(period);

    expect(metrics.cost.estimatedCostPerSessionUsd).toBe(
      ESTIMATED_COST_PER_SESSION_USD,
    );
    expect(metrics.cost.estimateRatio).toBeCloseTo(2, 3);
  });

  it('과금된 호출이 없으면 배수를 내지 않는다', async () => {
    // 스텁만 도는 동안 0배로 표시하면 "추정보다 싸다"로 잘못 읽힌다.
    const service = build(emptySummary({ calls: 5 }), [1, 1, 0, 0, 0]);

    const metrics = await service.metrics(period);

    expect(metrics.cost.estimateRatio).toBeNull();
  });

  it('구독 지표는 0이 아니라 미구현으로 표시한다', async () => {
    const service = build(emptySummary(), [0, 0, 0, 0, 0]);

    const metrics = await service.metrics(period);

    expect(metrics.unavailable).toContain('subscriptions');
  });
});
