import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnthropicInterviewEngine } from './anthropic-interview-engine';
import { LlmUsage } from './entities/llm-usage.entity';
import { INTERVIEW_ENGINE, InterviewEngine } from './interview-engine';
import { LlmUsageService } from './llm-usage.service';
import { StubInterviewEngine } from './stub-interview-engine';

/**
 * LLM 프록시 모듈.
 *
 * 키가 있으면 실어댑터를, 없으면 결정적 스텁을 주입한다 (ADR 0003).
 * 로컬 개발과 CI가 키 없이 그대로 돌아야 하므로 폴백은 선택이 아니라 요구사항이다.
 *
 * 사용량 기록(LlmUsageService)은 엔진 종류와 무관하게 이 모듈이 제공한다 —
 * 어댑터를 갈아끼워도 비용 집계는 끊기지 않아야 한다.
 */
@Module({
  imports: [TypeOrmModule.forFeature([LlmUsage])],
  providers: [
    LlmUsageService,
    StubInterviewEngine,
    AnthropicInterviewEngine,
    {
      provide: INTERVIEW_ENGINE,
      inject: [ConfigService, StubInterviewEngine, AnthropicInterviewEngine],
      useFactory: (
        config: ConfigService,
        stub: StubInterviewEngine,
        anthropic: AnthropicInterviewEngine,
      ): InterviewEngine => {
        const hasKey = !!config.get<string>('LLM_API_KEY');
        if (hasKey) return anthropic;

        new Logger('LlmModule').warn(
          'LLM_API_KEY가 없어 스텁 엔진으로 동작합니다. 실제 질문·평가가 생성되지 않습니다.',
        );
        return stub;
      },
    },
  ],
  exports: [INTERVIEW_ENGINE, LlmUsageService],
})
export class LlmModule {}
