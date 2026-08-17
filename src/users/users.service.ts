import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshTokenStore } from '../auth/refresh-token.store';
import { AppException } from '../common/exceptions/app.exception';
import { UsageService, UsageSummary } from '../usage/usage.service';
import { AgreementsDto } from './dto/onboarding.dto';
import { UserAgreement } from './entities/user-agreement.entity';
import { User } from './entities/user.entity';
import { assertValidNickname, nicknameKey } from './nickname.rule';

/** Postgres unique_violation — 동시에 같은 닉네임을 저장하려 할 때. */
const UNIQUE_VIOLATION = '23505';

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
    const trimmed = assertValidNickname(nickname);
    this.assertRequiredAgreements(agreements);

    const user = await this.findActiveUser(userId);
    await this.assertNicknameAvailable(trimmed, user.id);

    user.nickname = trimmed;
    await this.saveUserNickname(user);

    await this.saveAgreements(user, agreements);
    return { onboardingCompleted: true };
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.findActiveUser(userId);
    return this.toProfile(user);
  }

  async updateNickname(userId: string, nickname: string): Promise<UserProfile> {
    const trimmed = assertValidNickname(nickname);

    const user = await this.findActiveUser(userId);
    await this.assertNicknameAvailable(trimmed, user.id);

    user.nickname = trimmed;
    await this.saveUserNickname(user);

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

  /**
   * 닉네임 중복 검사 — 대소문자를 무시하고 비교한다(`nicknameKey`).
   * 본인이 이미 쓰던 닉네임은 그대로 통과시킨다(재온보딩·동일값 저장 대비).
   */
  private async assertNicknameAvailable(
    nickname: string,
    userId: string,
  ): Promise<void> {
    if (await this.isNicknameTaken(nickname, userId)) throw nicknameTaken();
  }

  private async isNicknameTaken(
    nickname: string,
    excludeUserId?: string,
  ): Promise<boolean> {
    const query = this.userRepo
      .createQueryBuilder('user')
      .where('lower(user.nickname) = :key', { key: nicknameKey(nickname) });

    if (excludeUserId) {
      query.andWhere('user.id <> :userId', { userId: excludeUserId });
    }
    return (await query.getCount()) > 0;
  }

  /**
   * 닉네임 사용 가능 여부 (온보딩 화면 실시간 확인용).
   * 형식이 어긋나면 422로 막고, 통과하면 중복만 알려준다.
   */
  async checkNicknameAvailability(
    nickname: string,
    userId: string,
  ): Promise<{ nickname: string; available: boolean }> {
    const trimmed = assertValidNickname(nickname);

    return {
      nickname: trimmed,
      available: !(await this.isNicknameTaken(trimmed, userId)),
    };
  }

  /**
   * 저장 — 검사와 저장 사이에 다른 요청이 같은 닉네임을 선점할 수 있으므로
   * DB 유니크 위반도 409로 변환한다(경쟁 상태 방어).
   */
  private async saveUserNickname(user: User): Promise<void> {
    try {
      await this.userRepo.save(user);
    } catch (error) {
      if (isUniqueViolation(error)) throw nicknameTaken();
      throw error;
    }
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

function nicknameTaken(): AppException {
  return new AppException(
    'NICKNAME_TAKEN',
    '이미 사용 중인 닉네임이에요.',
    HttpStatus.CONFLICT,
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}
