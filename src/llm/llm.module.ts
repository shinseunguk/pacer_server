import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmUsage } from './entities/llm-usage.entity';
import { INTERVIEW_ENGINE } from './interview-engine';
import { LlmUsageService } from './llm-usage.service';
import { StubInterviewEngine } from './stub-interview-engine';

/**
 * LLM 프록시 모듈.
 * 지금은 결정적 스텁 어댑터를 주입하고, 마일스톤 2에서 실제 LLM 어댑터로 교체한다.
 * 소비 측(interviews)은 INTERVIEW_ENGINE 토큰만 알면 되므로 교체 시 영향이 없다.
 *
 * 사용량 기록(LlmUsageService)은 엔진 종류와 무관하게 이 모듈이 제공한다 —
 * 어댑터를 갈아끼워도 비용 집계는 끊기지 않아야 한다.
 */
@Module({
  imports: [TypeOrmModule.forFeature([LlmUsage])],
  providers: [
    LlmUsageService,
    { provide: INTERVIEW_ENGINE, useClass: StubInterviewEngine },
  ],
  exports: [INTERVIEW_ENGINE, LlmUsageService],
})
export class LlmModule {}
