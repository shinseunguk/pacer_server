import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../auth/decorators/public.decorator';
import { RedisService } from '../redis/redis.service';

interface HealthResult {
  status: 'ok' | 'degraded';
  db: boolean;
  redis: boolean;
}

@ApiTags('health')
// 로드밸런서·모니터링 프로브가 상한에 걸리면 안 된다.
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '헬스체크 (DB·Redis 연결)' })
  async check(): Promise<HealthResult> {
    const [db, redis] = await Promise.all([this.pingDb(), this.pingRedis()]);

    return { status: db && redis ? 'ok' : 'degraded', db, redis };
  }

  private async pingDb(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async pingRedis(): Promise<boolean> {
    try {
      return await this.redis.ping();
    } catch {
      return false;
    }
  }
}
