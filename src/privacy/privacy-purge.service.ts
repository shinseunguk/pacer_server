import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { InterviewSession } from '../interviews/entities/interview-session.entity';
import { User } from '../users/entities/user.entity';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/** 매일 04:00 KST — 트래픽이 가장 적은 시간대. */
const PURGE_CRON = '0 4 * * *';
const PURGE_TIMEZONE = 'Asia/Seoul';

export interface PurgeSummary {
  /** 하드 삭제한 탈퇴 계정 수 */
  withdrawnUsers: number;
  /** 민감 원문을 지운 세션 수 */
  sensitiveSessions: number;
}

/**
 * 개인정보 파기 배치 (기획서 §6 · ERD §5).
 *
 * - 탈퇴 계정: `deleted_at`이 찍힌 사용자를 하드 삭제한다. 세션·메시지·평가·동의·사용량은
 *   FK ON DELETE CASCADE로 함께 사라진다 ("탈퇴 시 지체 없이 파기").
 * - 민감 원문: 보관 기간이 지난 세션의 공고 원문·자소서·이력서 참조를 NULL로 만든다.
 *   대화·평가 기록은 성장 추적·재열람에 필요하므로 남긴다.
 */
@Injectable()
export class PrivacyPurgeService {
  private readonly logger = new Logger(PrivacyPurgeService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(InterviewSession)
    private readonly sessionRepo: Repository<InterviewSession>,
    private readonly config: ConfigService,
  ) {}

  @Cron(PURGE_CRON, { name: 'privacy-purge', timeZone: PURGE_TIMEZONE })
  async runDailyPurge(): Promise<PurgeSummary> {
    const summary: PurgeSummary = {
      withdrawnUsers: await this.purgeWithdrawnUsers(),
      sensitiveSessions: await this.purgeExpiredSensitiveData(),
    };

    if (summary.withdrawnUsers > 0 || summary.sensitiveSessions > 0) {
      this.logger.log(
        `개인정보 파기 완료 — 탈퇴 계정 ${summary.withdrawnUsers}건, 민감 원문 ${summary.sensitiveSessions}건`,
      );
    }
    return summary;
  }

  /** 탈퇴(soft delete) 계정을 실제로 삭제한다. */
  async purgeWithdrawnUsers(): Promise<number> {
    const withdrawn = await this.userRepo.find({
      where: { deletedAt: Not(IsNull()) },
      withDeleted: true,
      select: { id: true },
    });

    if (withdrawn.length === 0) return 0;

    await this.userRepo.delete(withdrawn.map((user) => user.id));
    return withdrawn.length;
  }

  /** 보관 기간이 지난 세션의 민감 원문을 지운다. */
  async purgeExpiredSensitiveData(now: Date = new Date()): Promise<number> {
    const threshold = new Date(now.getTime() - this.retentionDays * DAY_IN_MS);

    const result = await this.sessionRepo
      .createQueryBuilder()
      .update(InterviewSession)
      .set({ jobPostingText: null, applicantInfo: null, resumeRef: null })
      .where('created_at < :threshold', { threshold })
      .andWhere(
        '(job_posting_text IS NOT NULL OR applicant_info IS NOT NULL OR resume_ref IS NOT NULL)',
      )
      .execute();

    return result.affected ?? 0;
  }

  private get retentionDays(): number {
    return this.config.get<number>('SENSITIVE_RETENTION_DAYS', 90);
  }
}
