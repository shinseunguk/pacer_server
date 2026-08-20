import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { secondsUntilKstMidnight, todayInKst } from '../common/util/kst-date';
import { RedisService } from '../redis/redis.service';
import { User } from '../users/entities/user.entity';
import { DailyUsage } from './entities/daily-usage.entity';

/** Redis 카운터 네임스페이스 — 질문 수와 면접 시작 수는 다른 한도다. */
const BASE_QUESTION_SCOPE = 'base_question';
const INTERVIEW_SCOPE = 'interview_start';

export interface UsageSummary {
  /** KST 기준 날짜 (YYYY-MM-DD) */
  date: string;
  baseQuestionUsed: number;
  limit: number;
  remaining: number;
}

/**
 * 일일 기본 질문 사용량.
 * 실시간 카운터는 Redis(자정 KST TTL), 영속 백업은 `daily_usage` 테이블이 담당한다.
 * Phase A는 카운트만 하고 페이월(402)은 노출하지 않는다 (MVP 범위 §2).
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    @InjectRepository(DailyUsage)
    private readonly usageRepo: Repository<DailyUsage>,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async getTodaySummary(userId: string): Promise<UsageSummary> {
    const date = todayInKst();
    const baseQuestionUsed = await this.readCount(userId, date);
    const limit = this.dailyLimit;

    return {
      date,
      baseQuestionUsed,
      limit,
      remaining: Math.max(0, limit - baseQuestionUsed),
    };
  }

  /**
   * 기본 질문 1개 소비. 꼬리질문은 카운트하지 않는다 (기획서 §횟수제).
   * Redis 카운터를 증가시키고 DB 백업을 갱신한다.
   */
  async consumeBaseQuestion(userId: string): Promise<number> {
    const date = todayInKst();
    const count = await this.incrementRedis(userId, date);
    await this.incrementDb(userId, date);
    return count ?? (await this.readDbCount(userId, date));
  }

  private async readCount(userId: string, date: string): Promise<number> {
    const cached = await this.readRedisCount(userId, date);
    return cached ?? (await this.readDbCount(userId, date));
  }

  private async readRedisCount(
    userId: string,
    date: string,
  ): Promise<number | null> {
    try {
      const raw = await this.redis.getClient().get(usageKey(userId, date));
      if (raw === null) return null;

      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    } catch (error) {
      // Redis 장애가 면접 진행을 막지 않도록 DB 백업으로 폴백한다.
      this.logger.warn(
        `Redis 사용량 조회 실패, DB로 폴백: ${asMessage(error)}`,
      );
      return null;
    }
  }

  private async incrementRedis(
    userId: string,
    date: string,
    scope: string = BASE_QUESTION_SCOPE,
  ): Promise<number | null> {
    try {
      const key = usageKey(userId, date, scope);
      const count = await this.redis.getClient().incr(key);
      if (count === 1) {
        await this.redis.getClient().expire(key, secondsUntilKstMidnight());
      }
      return count;
    } catch (error) {
      this.logger.warn(
        `Redis 사용량 증가 실패, DB만 갱신: ${asMessage(error)}`,
      );
      return null;
    }
  }

  private async incrementDb(userId: string, date: string): Promise<void> {
    const existing = await this.findUsage(userId, date);
    if (existing) {
      await this.usageRepo.increment(
        { id: existing.id },
        'baseQuestionCount',
        1,
      );
      return;
    }

    await this.usageRepo.save(
      this.usageRepo.create({
        user: { id: userId } as User,
        usageDate: date,
        baseQuestionCount: 1,
      }),
    );
  }

  private async readDbCount(userId: string, date: string): Promise<number> {
    const usage = await this.findUsage(userId, date);
    return usage?.baseQuestionCount ?? 0;
  }

  private findUsage(userId: string, date: string): Promise<DailyUsage | null> {
    return this.usageRepo.findOne({
      where: { user: { id: userId }, usageDate: date },
    });
  }

  /**
   * 하루 면접 시작 횟수를 세고 상한을 넘으면 false.
   *
   * 구독은 무제한이지만 자동화·공유 계정으로 원가가 무너지는 걸 막는 안전장치다.
   * 가격표에는 노출하지 않고 약관(fair-use)에만 둔다 — 상한을 앞세우면
   * 무제한이라는 약속이 무색해진다.
   */
  async tryConsumeDailyInterview(userId: string): Promise<boolean> {
    const date = todayInKst();
    const limit = this.dailyInterviewLimit;
    const count = await this.incrementRedis(userId, date, INTERVIEW_SCOPE);

    // Redis 장애 시에는 막지 않는다 — 상한은 안전장치일 뿐, 서비스를 세울 이유가 아니다.
    if (count === null) return true;
    return count <= limit;
  }

  private get dailyLimit(): number {
    return this.config.get<number>('FREE_DAILY_QUESTION_LIMIT', 20);
  }

  private get dailyInterviewLimit(): number {
    return this.config.get<number>('DAILY_INTERVIEW_LIMIT', 5);
  }
}

function usageKey(
  userId: string,
  date: string,
  scope: string = BASE_QUESTION_SCOPE,
): string {
  return `usage:${scope}:${userId}:${date}`;
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
