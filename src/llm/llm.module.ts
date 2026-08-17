import { Module } from '@nestjs/common';
import { INTERVIEW_ENGINE } from './interview-engine';
import { StubInterviewEngine } from './stub-interview-engine';

/**
 * LLM 프록시 모듈.
 * 지금은 결정적 스텁 어댑터를 주입하고, 마일스톤 2에서 실제 LLM 어댑터로 교체한다.
 * 소비 측(interviews)은 INTERVIEW_ENGINE 토큰만 알면 되므로 교체 시 영향이 없다.
 */
@Module({
  providers: [{ provide: INTERVIEW_ENGINE, useClass: StubInterviewEngine }],
  exports: [INTERVIEW_ENGINE],
})
export class LlmModule {}
