import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyUsage } from './entities/daily-usage.entity';
import { UsageService } from './usage.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([DailyUsage])],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
