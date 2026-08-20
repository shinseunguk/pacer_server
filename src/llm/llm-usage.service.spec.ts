import { Repository } from 'typeorm';
import { LlmUsage } from './entities/llm-usage.entity';
import { LlmUsageService } from './llm-usage.service';

function usageRow(overrides: Partial<LlmUsage> = {}): LlmUsage {
  return {
    id: 'u1',
    sessionId: 's1',
    method: 'evaluate',
    model: 'claude-opus-5',
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: '0.017500',
    latencyMs: 1200,
    isError: false,
    createdAt: new Date('2026-08-20T00:00:00Z'),
    ...overrides,
  };
}

describe('LlmUsageService', () => {
  let repository: jest.Mocked<Pick<Repository<LlmUsage>, 'insert' | 'find'>>;
  let service: LlmUsageService;

  const period = {
    from: new Date('2026-08-01T00:00:00Z'),
    to: new Date('2026-08-31T23:59:59Z'),
  };

  beforeEach(() => {
    repository = {
      insert: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
    };
    service = new LlmUsageService(
      repository as unknown as Repository<LlmUsage>,
    );
  });

  it('토큰을 비용으로 환산해 기록한다', async () => {
    await service.record({
      sessionId: 's1',
      method: 'evaluate',
      model: 'claude-opus-5',
      inputTokens: 1_000_000,
      outputTokens: 0,
      latencyMs: 900,
    });

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ costUsd: '5.000000', model: 'claude-opus-5' }),
    );
  });

  it('기록에 실패해도 예외를 밖으로 던지지 않는다', async () => {
    // 사용량을 못 남겼다고 진행 중인 면접을 실패시키면 본말전도다.
    repository.insert.mockRejectedValue(new Error('db down'));

    await expect(
      service.record({
        sessionId: 's1',
        method: 'evaluate',
        model: 'claude-opus-5',
        inputTokens: 10,
        outputTokens: 10,
        latencyMs: 10,
      }),
    ).resolves.toBeUndefined();
  });

  it('단가표에 없는 모델은 기록하지 않고 로그만 남긴다', async () => {
    await service.record({
      sessionId: 's1',
      method: 'evaluate',
      model: 'claude-unknown-9',
      inputTokens: 10,
      outputTokens: 10,
      latencyMs: 10,
    });

    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('메서드·모델별로 쪼개고 면접당 평균 비용을 낸다', async () => {
    repository.find.mockResolvedValue([
      usageRow({
        sessionId: 's1',
        method: 'generateQuestions',
        costUsd: '0.05',
      }),
      usageRow({ sessionId: 's1', method: 'evaluate', costUsd: '0.15' }),
      usageRow({ sessionId: 's2', method: 'evaluate', costUsd: '0.20' }),
    ]);

    const summary = await service.summarize(period);

    expect(summary.calls).toBe(3);
    expect(summary.sessions).toBe(2);
    expect(summary.costUsd).toBeCloseTo(0.4, 6);
    expect(summary.costPerSessionUsd).toBeCloseTo(0.2, 6);
    expect(summary.byMethod.map((row) => row.key)).toEqual([
      'evaluate',
      'generateQuestions',
    ]);
  });

  it('캐시 적중률은 과금된 입력 토큰 대비로 계산한다', async () => {
    repository.find.mockResolvedValue([
      usageRow({ inputTokens: 750, cacheReadTokens: 250 }),
    ]);

    const summary = await service.summarize(period);

    expect(summary.cacheHitRatio).toBeCloseTo(0.25, 6);
  });

  it('기록이 없으면 0으로 나누지 않는다', async () => {
    const summary = await service.summarize(period);

    expect(summary.costPerSessionUsd).toBe(0);
    expect(summary.cacheHitRatio).toBe(0);
  });

  it('일자별로 비용을 묶는다', async () => {
    repository.find.mockResolvedValue([
      usageRow({
        createdAt: new Date('2026-08-19T01:00:00Z'),
        costUsd: '0.10',
      }),
      usageRow({
        createdAt: new Date('2026-08-19T23:00:00Z'),
        costUsd: '0.20',
      }),
      usageRow({
        createdAt: new Date('2026-08-20T01:00:00Z'),
        costUsd: '0.30',
      }),
    ]);

    const daily = await service.dailyCosts(period);

    expect(daily).toEqual([
      { date: '2026-08-19', costUsd: 0.3, calls: 2 },
      { date: '2026-08-20', costUsd: 0.3, calls: 1 },
    ]);
  });
});
