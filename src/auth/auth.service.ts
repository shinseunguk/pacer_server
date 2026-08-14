import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { UserAgreement } from '../users/entities/user-agreement.entity';
import { User } from '../users/entities/user.entity';
import { RefreshTokenStore } from './refresh-token.store';
import { SocialVerifierService } from './social/social-verifier.service';
import { SocialProvider } from './social/social-verifier.interface';
import { TokenPair, TokenService } from './token.service';

export interface LoginResult extends TokenPair {
  isNewUser: boolean;
  onboardingCompleted: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserAgreement)
    private readonly agreementRepo: Repository<UserAgreement>,
    private readonly verifiers: SocialVerifierService,
    private readonly tokens: TokenService,
    private readonly refreshStore: RefreshTokenStore,
  ) {}

  async login(
    provider: SocialProvider,
    idToken: string,
    nonce?: string,
  ): Promise<LoginResult> {
    const profile = await this.verifiers.verify(provider, idToken, nonce);

    let user = await this.userRepo.findOne({
      where: { socialProvider: profile.provider, socialId: profile.socialId },
    });

    const isNewUser = !user;
    if (!user) {
      // 애플 등은 최초 로그인 시에만 name/email 제공 → 이 시점에 즉시 저장.
      user = await this.userRepo.save(
        this.userRepo.create({
          socialProvider: profile.provider,
          socialId: profile.socialId,
          nickname: profile.name ?? '',
          email: profile.email ?? null,
        }),
      );
    }

    const onboardingCompleted = await this.agreementRepo.exists({
      where: { user: { id: user.id } },
    });

    const pair = await this.issueAndStore(user.id);
    return { ...pair, isNewUser, onboardingCompleted };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = await this.tokens.verifyRefresh(refreshToken).catch(() => {
      throw this.unauthorized();
    });

    const matches = await this.refreshStore.matches(payload.sub, refreshToken);
    if (!matches) throw this.unauthorized();

    // 회전(rotation): 새 쌍 발급 + 저장(기존 refresh 무효화).
    return this.issueAndStore(payload.sub);
  }

  async logout(userId: string): Promise<void> {
    await this.refreshStore.revoke(userId);
  }

  private async issueAndStore(userId: string): Promise<TokenPair> {
    const pair = await this.tokens.issuePair(userId);
    await this.refreshStore.save(
      userId,
      pair.refreshToken,
      this.tokens.refreshTtlSeconds,
    );
    return pair;
  }

  private unauthorized(): AppException {
    return new AppException(
      'UNAUTHORIZED',
      '유효하지 않은 리프레시 토큰이에요.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
