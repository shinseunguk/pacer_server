import { Injectable, Logger } from '@nestjs/common';
import { GeneratedQuestion } from '../llm/interview-engine';
import { RedisService } from '../redis/redis.service';

/** 이어하기(일시정지 → 며칠 뒤 재개)를 고려한 보관 기간. */
const PLAN_TTL_SECONDS = 14 * 24 * 60 * 60;

/**
 * 세션 생성 시 1콜로 일괄 생성한 기본 질문 플랜 캐시 (프롬프트 설계 §1 비용 절감).
 * 아직 던지지 않은 질문만 담고, 실제로 던진 질문은 `interview_messages`에 적재된다.
 * 캐시가 비면 서비스가 같은 컨텍스트로 다시 생성한다.
 */
@Injectable()
export class QuestionPlanStore {
  private readonly logger = new Logger(QuestionPlanStore.name);

  constructor(private readonly redis: RedisService) {}

  async save(sessionId: string, questions: GeneratedQuestion[]): Promise<void> {
    try {
      await this.redis
        .getClient()
        .set(
          planKey(sessionId),
          JSON.stringify(questions),
          'EX',
          PLAN_TTL_SECONDS,
        );
    } catch (error) {
      // 캐시는 최적화 수단이므로 실패해도 면접 진행을 막지 않는다(플랜은 재생성된다).
      this.logger.warn(`질문 플랜 저장 실패: ${asMessage(error)}`);
    }
  }

  async get(sessionId: string): Promise<GeneratedQuestion[] | null> {
    try {
      const raw = await this.redis.getClient().get(planKey(sessionId));
      if (!raw) return null;
      return JSON.parse(raw) as GeneratedQuestion[];
    } catch (error) {
      this.logger.warn(`질문 플랜 조회 실패: ${asMessage(error)}`);
      return null;
    }
  }

  async clear(sessionId: string): Promise<void> {
    try {
      await this.redis.getClient().del(planKey(sessionId));
    } catch (error) {
      this.logger.warn(`질문 플랜 삭제 실패: ${asMessage(error)}`);
    }
  }
}

function planKey(sessionId: string): string {
  return `interview:plan:${sessionId}`;
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
