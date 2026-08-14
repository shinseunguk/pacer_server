import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshTokenStore } from '../auth/refresh-token.store';
import { AppException } from '../common/exceptions/app.exception';
import { UsageService, UsageSummary } from '../usage/usage.service';
import { AgreementsDto } from './dto/onboarding.dto';
import { UserAgreement } from './entities/user-agreement.entity';
import { User } from './entities/user.entity';

const NICKNAME_MIN_LENGTH = 1;
const NICKNAME_MAX_LENGTH = 20;

export interface UserProfile {
  id: string;
  nickname: string;
  email: string | null;
  isPro: boolean;
  usage: UsageSummary;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserAgreement)
    private readonly agreementRepo: Repository<UserAgreement>,
    private readonly usage: UsageService,
    private readonly refreshStore: RefreshTokenStore,
  ) {}

  /** 최초 온보딩 — 닉네임 정본 저장 + 필수 동의 수집. 재호출 시 갱신(멱등). */
  async completeOnboarding(
    userId: string,
    nickname: string,
    agreements: AgreementsDto,
  ): Promise<{ onboardingCompleted: true }> {
    const trimmed = this.validateNickname(nickname);
    this.assertRequiredAgreements(agreements);

    const user = await this.findActiveUser(userId);
    user.nickname = trimmed;
    await this.userRepo.save(user);

    await this.saveAgreements(user, agreements);
    return { onboardingCompleted: true };
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.findActiveUser(userId);
    return this.toProfile(user);
  }

  async updateNickname(userId: string, nickname: string): Promise<UserProfile> {
    const trimmed = this.validateNickname(nickname);

    const user = await this.findActiveUser(userId);
    user.nickname = trimmed;
    await this.userRepo.save(user);

    return this.toProfile(user);
  }

  /** 탈퇴 — soft delete로 파기 대상 표시. 실제 파기는 후속 배치가 처리한다. */
  async withdraw(userId: string): Promise<void> {
    const user = await this.findActiveUser(userId);

    if (user.isPro) {
      throw new AppException(
        'ACTIVE_SUBSCRIPTION',
        '구독이 활성 상태예요. 구독을 해지한 뒤 탈퇴할 수 있어요.',
        HttpStatus.CONFLICT,
      );
    }

    await this.userRepo.softDelete(user.id);
    // 탈퇴 즉시 재발급 경로를 끊는다(남은 access 토큰은 만료로 소멸).
    await this.refreshStore.revoke(user.id);
  }

  private async saveAgreements(
    user: User,
    agreements: AgreementsDto,
  ): Promise<void> {
    const existing = await this.agreementRepo.findOne({
      where: { user: { id: user.id } },
    });

    await this.agreementRepo.save(
      this.agreementRepo.create({
        ...existing,
        user,
        terms: agreements.terms,
        privacy: agreements.privacy,
        llmConsent: agreements.llmConsent,
        marketing: agreements.marketing ?? false,
        agreedAt: new Date(),
      }),
    );
  }

  private async toProfile(user: User): Promise<UserProfile> {
    return {
      id: user.id,
      nickname: user.nickname,
      email: user.email,
      isPro: user.isPro,
      usage: await this.usage.getTodaySummary(user.id),
    };
  }

  /** softDelete 된 사용자는 조회되지 않으므로 탈퇴 후 접근은 자동으로 차단된다. */
  private async findActiveUser(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new AppException(
        'USER_NOT_FOUND',
        '사용자를 찾을 수 없어요.',
        HttpStatus.NOT_FOUND,
      );
    }
    return user;
  }

  private validateNickname(nickname: string): string {
    const trimmed = nickname.trim();
    if (
      trimmed.length < NICKNAME_MIN_LENGTH ||
      trimmed.length > NICKNAME_MAX_LENGTH
    ) {
      throw new AppException(
        'INVALID_NICKNAME',
        `닉네임은 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자로 입력해주세요.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return trimmed;
  }

  private assertRequiredAgreements(agreements: AgreementsDto): void {
    if (agreements.terms && agreements.privacy && agreements.llmConsent) return;

    throw new AppException(
      'AGREEMENT_REQUIRED',
      '필수 동의 항목에 모두 동의해야 이용할 수 있어요.',
      HttpStatus.BAD_REQUEST,
    );
  }
}
