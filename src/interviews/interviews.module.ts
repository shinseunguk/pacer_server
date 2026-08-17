import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobRole } from '../jobs/entities/job-role.entity';
import { LlmModule } from '../llm/llm.module';
import { UsageModule } from '../usage/usage.module';
import { EvaluationScore } from './entities/evaluation-score.entity';
import { InterviewMessage } from './entities/interview-message.entity';
import { InterviewSession } from './entities/interview-session.entity';
import { MessageFeedback } from './entities/message-feedback.entity';
import { SessionEvaluation } from './entities/session-evaluation.entity';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';
import { QuestionPlanStore } from './question-plan.store';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InterviewSession,
      InterviewMessage,
      SessionEvaluation,
      EvaluationScore,
      MessageFeedback,
      JobRole,
    ]),
    UsageModule,
    LlmModule,
  ],
  controllers: [InterviewsController],
  providers: [InterviewsService, QuestionPlanStore],
})
export class InterviewsModule {}
