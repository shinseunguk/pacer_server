import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { LlmMethod, LlmUsage } from './entities/llm-usage.entity';
import { computeCostUsd, TokenUsage } from './model-pricing';

export interface RecordUsageInput extends TokenUsage {
  sessionId: string | null;
  method: LlmMethod;
  model: string;
  latencyMs: number;
  isError?: boolean;
}

export interface UsagePeriod {
  from: Date;
  to: Date;
}

export interface UsageBreakdown {
  key: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface UsageSummary {
  calls: number;
  errorCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  /** 비용이 발생한 세션 수 (면접당 평균 비용의 분모) */
  sessions: number;
  costPerSessionUsd: number;
  /** 입력 토큰 중 캐시로 읽힌 비율. 최소 프리픽스 미달이면 0에 붙는다. */
  cacheHitRatio: number;
  byMethod: UsageBreakdown[];
  byModel: UsageBreakdown[];
}

/**
 * LLM 사용량 기록·집계.
 *
 * 기록은 **면접 흐름을 막지 않는다** — 사용량을 남기지 못했다고 진행 중인 면접을
 * 실패시키는 건 본말전도다. 실패는 로그로만 남긴다.
 */
@Injectable()
export class LlmUsageService {
  private readonly logger = new Logger(LlmUsageService.name);

  constructor(
    @InjectRepository(LlmUsage)
    private readonly usages: Repository<LlmUsage>,
  ) {}

  async record(input: RecordUsageInput): Promise<void> {
    try {
      const costUsd = computeCostUsd(input.model, input);

      await this.usages.insert({
        sessionId: input.sessionId,
        method: input.method,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        cacheReadTokens: input.cacheReadTokens ?? 0,
        cacheWriteTokens: input.cacheWriteTokens ?? 0,
        costUsd: costUsd.toFixed(6),
        latencyMs: input.latencyMs,
        isError: input.isError ?? false,
      });
    } catch (error) {
      this.logger.warn(
        `LLM 사용량 기록 실패 (method=${input.method}, model=${input.model})`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async summarize(period: UsagePeriod): Promise<UsageSummary> {
    const rows = await this.usages.find({
      where: { createdAt: Between(period.from, period.to) },
    });

    const sessions = new Set(
      rows.map((row) => row.sessionId).filter((id): id is string => !!id),
    );

    const totals = rows.reduce(
      (acc, row) => {
        acc.calls += 1;
        if (row.isError) acc.errorCalls += 1;
        acc.inputTokens += row.inputTokens;
        acc.outputTokens += row.outputTokens;
        acc.cacheReadTokens += row.cacheReadTokens;
        acc.cacheWriteTokens += row.cacheWriteTokens;
        acc.costUsd += Number(row.costUsd);
        return acc;
      },
      {
        calls: 0,
        errorCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costUsd: 0,
      },
    );

    const billedInput = totals.inputTokens + totals.cacheReadTokens;

    return {
      ...totals,
      costUsd: roundUsd(totals.costUsd),
      sessions: sessions.size,
      costPerSessionUsd: sessions.size
        ? roundUsd(totals.costUsd / sessions.size)
        : 0,
      cacheHitRatio: billedInput ? totals.cacheReadTokens / billedInput : 0,
      byMethod: breakdown(rows, (row) => row.method),
      byModel: breakdown(rows, (row) => row.model),
    };
  }

  /** 일자별 비용 추이 (대시보드 차트용). 날짜는 UTC 기준으로 자른다. */
  async dailyCosts(
    period: UsagePeriod,
  ): Promise<{ date: string; costUsd: number; calls: number }[]> {
    const rows = await this.usages.find({
      where: { createdAt: Between(period.from, period.to) },
      order: { createdAt: 'ASC' },
    });

    const byDate = new Map<string, { costUsd: number; calls: number }>();
    for (const row of rows) {
      const date = row.createdAt.toISOString().slice(0, 10);
      const bucket = byDate.get(date) ?? { costUsd: 0, calls: 0 };
      bucket.costUsd += Number(row.costUsd);
      bucket.calls += 1;
      byDate.set(date, bucket);
    }

    return [...byDate.entries()].map(([date, bucket]) => ({
      date,
      ...bucket,
      costUsd: roundUsd(bucket.costUsd),
    }));
  }
}

/**
 * 달러 금액을 6자리로 맞춘다.
 * 부동소수 누적은 0.1 + 0.2 = 0.30000000000000004를 만드는데, 그대로 두면
 * 대시보드에 그 숫자가 그대로 찍힌다. 저장 정밀도(numeric 12,6)와 같은 자리로 자른다.
 */
function roundUsd(value: number): number {
  return Number(value.toFixed(6));
}

function breakdown(
  rows: LlmUsage[],
  keyOf: (row: LlmUsage) => string,
): UsageBreakdown[] {
  const byKey = new Map<string, UsageBreakdown>();

  for (const row of rows) {
    const key = keyOf(row);
    const bucket = byKey.get(key) ?? {
      key,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    bucket.calls += 1;
    bucket.inputTokens += row.inputTokens;
    bucket.outputTokens += row.outputTokens;
    bucket.costUsd += Number(row.costUsd);
    byKey.set(key, bucket);
  }

  return [...byKey.values()]
    .map((bucket) => ({ ...bucket, costUsd: roundUsd(bucket.costUsd) }))
    .sort((a, b) => b.costUsd - a.costUsd);
}
