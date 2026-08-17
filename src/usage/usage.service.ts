import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { secondsUntilKstMidnight, todayInKst } from '../common/util/kst-date';
import { RedisService } from '../redis/redis.service';
import { User } from '../users/entities/user.entity';
import { DailyUsage } from './entities/daily-usage.entity';

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
  ): Promise<number | null> {
    try {
      const key = usageKey(userId, date);
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

  private get dailyLimit(): number {
    return this.config.get<number>('FREE_DAILY_QUESTION_LIMIT', 20);
  }
}

function usageKey(userId: string, date: string): string {
  return `usage:base_question:${userId}:${date}`;
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
