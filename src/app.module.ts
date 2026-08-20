import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { InterviewsModule } from './interviews/interviews.module';
import { JobsModule } from './jobs/jobs.module';
import { LegalModule } from './legal/legal.module';
import { PrivacyModule } from './privacy/privacy.module';
import { RedisModule } from './redis/redis.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { UsersModule } from './users/users.module';

const SECOND_IN_MS = 1000;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    // 요청 폭주·크리덴셜 스터핑 방어 (초당 상한은 THROTTLE_* 로 조정).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL', 60) * SECOND_IN_MS,
          limit: config.get<number>('THROTTLE_LIMIT', 120),
        },
      ],
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    AuthModule,
    UsersModule,
    JobsModule,
    InterviewsModule,
    LegalModule,
    PrivacyModule,
    HealthModule,
    SubscriptionsModule,
    AdminModule,
  ],
  providers: [
    // 순서 주의 — rate limit을 먼저 적용한 뒤 인증을 확인한다.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // 전역 인증 가드 — @Public() 이 붙지 않은 모든 엔드포인트는 인증 필요.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
