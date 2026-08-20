import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InterviewSession } from '../interviews/entities/interview-session.entity';
import { SessionFeedback } from '../interviews/entities/session-feedback.entity';
import { LlmModule } from '../llm/llm.module';
import { User } from '../users/entities/user.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/** 운영 대시보드. 사용자 API와 인증 축이 다르다 (ADMIN_API_TOKEN). */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, InterviewSession, SessionFeedback]),
    LlmModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
