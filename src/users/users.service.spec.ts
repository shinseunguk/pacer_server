import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { UsageService } from '../usage/usage.service';
import { RefreshTokenStore } from '../auth/refresh-token.store';
import { AgreementsDto } from './dto/onboarding.dto';
import { UsersService } from './users.service';

const ALL_AGREED: AgreementsDto = {
  terms: true,
  privacy: true,
  llmConsent: true,
  marketing: false,
};

const USAGE_SUMMARY = {
  date: '2026-08-14',
  baseQuestionUsed: 3,
  limit: 20,
  remaining: 17,
};

interface Repo {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  softDelete: jest.Mock;
}

function createRepo(): Repo {
  return {
    findOne: jest.fn(),
    create: jest.fn((v: Record<string, unknown>) => v),
    save: jest.fn((v: Record<string, unknown>) => Promise.resolve(v)),
    softDelete: jest.fn().mockResolvedValue(undefined),
  };
}

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    nickname: '',
    email: null,
    isPro: false,
    ...overrides,
  };
}

/** 던져진 AppException의 상태코드를 확인한다. */
async function expectStatus(
  promise: Promise<unknown>,
  status: HttpStatus,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(AppException);
  await promise.catch((e: AppException) => {
    expect(e.getStatus()).toBe(status);
  });
}

describe('UsersService', () => {
  let userRepo: Repo;
  let agreementRepo: Repo;
  let usage: { getTodaySummary: jest.Mock };
  let refreshStore: { revoke: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    userRepo = createRepo();
    agreementRepo = createRepo();
    usage = { getTodaySummary: jest.fn().mockResolvedValue(USAGE_SUMMARY) };
    refreshStore = { revoke: jest.fn().mockResolvedValue(undefined) };

    service = new UsersService(
      userRepo as never,
      agreementRepo as never,
      usage as unknown as UsageService,
      refreshStore as unknown as RefreshTokenStore,
    );
  });

  describe('completeOnboarding', () => {
    it('닉네임을 trim해 저장하고 동의 이력을 남긴다', async () => {
      userRepo.findOne.mockResolvedValue(activeUser());
      agreementRepo.findOne.mockResolvedValue(null);

      const result = await service.completeOnboarding(
        'user-1',
        '  승욱  ',
        ALL_AGREED,
      );

      expect(result).toEqual({ onboardingCompleted: true });
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ nickname: '승욱' }),
      );
      expect(agreementRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          terms: true,
          privacy: true,
          llmConsent: true,
          marketing: false,
        }),
      );
    });

    it('재호출 시 기존 동의 이력을 갱신한다(멱등)', async () => {
      userRepo.findOne.mockResolvedValue(activeUser());
      agreementRepo.findOne.mockResolvedValue({ id: 'agreement-1' });

      await service.completeOnboarding('user-1', '승욱', {
        ...ALL_AGREED,
        marketing: true,
      });

      expect(agreementRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'agreement-1', marketing: true }),
      );
    });

    it('닉네임이 공백뿐이면 422', async () => {
      userRepo.findOne.mockResolvedValue(activeUser());

      await expectStatus(
        service.completeOnboarding('user-1', '   ', ALL_AGREED),
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('닉네임이 20자를 넘으면 422', async () => {
      userRepo.findOne.mockResolvedValue(activeUser());

      await expectStatus(
        service.completeOnboarding('user-1', 'a'.repeat(21), ALL_AGREED),
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    });

    it('필수 동의가 빠지면 400', async () => {
      userRepo.findOne.mockResolvedValue(activeUser());

      await expectStatus(
        service.completeOnboarding('user-1', '승욱', {
          ...ALL_AGREED,
          llmConsent: false,
        }),
        HttpStatus.BAD_REQUEST,
      );
      expect(agreementRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getProfile', () => {
    it('프로필과 오늘 사용량을 함께 반환한다', async () => {
      userRepo.findOne.mockResolvedValue(
        activeUser({ nickname: '승욱', email: 'me@test.com' }),
      );

      const profile = await service.getProfile('user-1');

      expect(profile).toEqual({
        id: 'user-1',
        nickname: '승욱',
        email: 'me@test.com',
        isPro: false,
        usage: USAGE_SUMMARY,
      });
    });

    it('탈퇴한 사용자는 조회되지 않아 404', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expectStatus(service.getProfile('user-1'), HttpStatus.NOT_FOUND);
    });
  });

  describe('updateNickname', () => {
    it('닉네임을 갱신한 프로필을 반환한다', async () => {
      userRepo.findOne.mockResolvedValue(activeUser({ nickname: '이전' }));

      const profile = await service.updateNickname('user-1', '새닉네임');

      expect(profile.nickname).toBe('새닉네임');
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ nickname: '새닉네임' }),
      );
    });

    it('빈 닉네임은 422', async () => {
      userRepo.findOne.mockResolvedValue(activeUser());

      await expectStatus(
        service.updateNickname('user-1', ''),
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    });
  });

  describe('withdraw', () => {
    it('soft delete 후 refresh 토큰을 무효화한다', async () => {
      userRepo.findOne.mockResolvedValue(activeUser());

      await service.withdraw('user-1');

      expect(userRepo.softDelete).toHaveBeenCalledWith('user-1');
      expect(refreshStore.revoke).toHaveBeenCalledWith('user-1');
    });

    it('구독이 활성이면 409이고 삭제하지 않는다', async () => {
      userRepo.findOne.mockResolvedValue(activeUser({ isPro: true }));

      await expectStatus(service.withdraw('user-1'), HttpStatus.CONFLICT);
      expect(userRepo.softDelete).not.toHaveBeenCalled();
    });
  });
});
