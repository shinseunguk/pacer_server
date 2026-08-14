import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from '../redis/redis.service';

/**
 * refresh 토큰을 Redis에 해시로 보관한다(회전·로그아웃 revoke 용).
 * 키: `auth:refresh:{userId}` = sha256(token), TTL = refresh 만료.
 */
@Injectable()
export class RefreshTokenStore {
  constructor(private readonly redis: RedisService) {}

  async save(userId: string, token: string, ttlSeconds: number): Promise<void> {
    await this.redis
      .getClient()
      .set(this.key(userId), this.hash(token), 'EX', ttlSeconds);
  }

  async matches(userId: string, token: string): Promise<boolean> {
    const stored = await this.redis.getClient().get(this.key(userId));
    return stored !== null && stored === this.hash(token);
  }

  async revoke(userId: string): Promise<void> {
    await this.redis.getClient().del(this.key(userId));
  }

  private key(userId: string): string {
    return `auth:refresh:${userId}`;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
