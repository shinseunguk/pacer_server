import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface RefreshPayload {
  sub: string;
  type: 'refresh';
}

/** JWT access/refresh 발급·검증. 두 토큰은 서로 다른 시크릿을 쓴다. */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issuePair(userId: string): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, type: 'access' },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<number>('JWT_ACCESS_TTL', 900),
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, type: 'refresh' },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.refreshTtlSeconds,
      },
    );
    return { accessToken, refreshToken };
  }

  async verifyRefresh(token: string): Promise<RefreshPayload> {
    return this.jwt.verifyAsync<RefreshPayload>(token, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
    });
  }

  get refreshTtlSeconds(): number {
    return this.config.get<number>('JWT_REFRESH_TTL', 1209600);
  }
}
