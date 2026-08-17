import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InterviewSession } from '../interviews/entities/interview-session.entity';
import { User } from '../users/entities/user.entity';
import { PrivacyPurgeService } from './privacy-purge.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([User, InterviewSession])],
  providers: [PrivacyPurgeService],
  exports: [PrivacyPurgeService],
})
export class PrivacyModule {}
