import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { todayInKst } from '../common/util/kst-date';
import { DailyUsage } from './entities/daily-usage.entity';

export interface UsageSummary {
  /** KST 기준 날짜 (YYYY-MM-DD) */
  date: string;
  baseQuestionUsed: number;
  limit: number;
  remaining: number;
}

/**
 * 일일 기본 질문 사용량 조회.
 * Phase A는 조회만 제공한다(카운트 증가는 면접 세션 구현에서 추가).
 */
@Injectable()
export class UsageService {
  constructor(
    @InjectRepository(DailyUsage)
    private readonly usageRepo: Repository<DailyUsage>,
    private readonly config: ConfigService,
  ) {}

  async getTodaySummary(userId: string): Promise<UsageSummary> {
    const date = todayInKst();
    const usage = await this.usageRepo.findOne({
      where: { user: { id: userId }, usageDate: date },
    });

    const baseQuestionUsed = usage?.baseQuestionCount ?? 0;
    const limit = this.dailyLimit;
    return {
      date,
      baseQuestionUsed,
      limit,
      remaining: Math.max(0, limit - baseQuestionUsed),
    };
  }

  private get dailyLimit(): number {
    return this.config.get<number>('FREE_DAILY_QUESTION_LIMIT', 20);
  }
}
