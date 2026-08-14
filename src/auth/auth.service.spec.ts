import { AppException } from '../common/exceptions/app.exception';
import { AuthService } from './auth.service';
import { RefreshTokenStore } from './refresh-token.store';
import { SocialVerifierService } from './social/social-verifier.service';
import { TokenService } from './token.service';

interface Repo {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  exists: jest.Mock;
}

function createRepo(): Repo {
  return {
    findOne: jest.fn(),
    create: jest.fn((v: Record<string, unknown>) => v),
    save: jest.fn((v: Record<string, unknown>) =>
      Promise.resolve({ id: 'user-1', ...v }),
    ),
    exists: jest.fn(),
  };
}

describe('AuthService', () => {
  let userRepo: Repo;
  let agreementRepo: Repo;
  let verifiers: { verify: jest.Mock };
  let tokens: Pick<TokenService, 'issuePair' | 'verifyRefresh'> & {
    refreshTtlSeconds: number;
  };
  let refreshStore: { save: jest.Mock; matches: jest.Mock; revoke: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    userRepo = createRepo();
    agreementRepo = createRepo();
    verifiers = { verify: jest.fn() };
    tokens = {
      issuePair: jest.fn().mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
      }),
      verifyRefresh: jest.fn(),
      refreshTtlSeconds: 1000,
    };
    refreshStore = {
      save: jest.fn().mockResolvedValue(undefined),
      matches: jest.fn(),
      revoke: jest.fn().mockResolvedValue(undefined),
    };

    service = new AuthService(
      userRepo as never,
      agreementRepo as never,
      verifiers as unknown as SocialVerifierService,
      tokens as unknown as TokenService,
      refreshStore as unknown as RefreshTokenStore,
    );
  });

  it('신규 사용자는 생성되고 애플 name/email이 저장되며 isNewUser=true', async () => {
    userRepo.findOne.mockResolvedValue(null);
    agreementRepo.exists.mockResolvedValue(false);
    verifiers.verify.mockResolvedValue({
      provider: 'apple',
      socialId: 'apple-1',
      email: 'me@test.com',
      name: '승욱',
    });

    const result = await service.login('apple', 'token');

    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        socialProvider: 'apple',
        socialId: 'apple-1',
        email: 'me@test.com',
        nickname: '승욱',
      }),
    );
    expect(result.isNewUser).toBe(true);
    expect(result.onboardingCompleted).toBe(false);
    expect(result.accessToken).toBe('access');
    expect(refreshStore.save).toHaveBeenCalledWith('user-1', 'refresh', 1000);
  });

  it('기존 사용자는 생성하지 않고 isNewUser=false, 동의 있으면 onboardingCompleted=true', async () => {
    userRepo.findOne.mockResolvedValue({ id: 'user-9' });
    agreementRepo.exists.mockResolvedValue(true);
    verifiers.verify.mockResolvedValue({
      provider: 'kakao',
      socialId: 'kakao-9',
    });

    const result = await service.login('kakao', 'token');

    expect(userRepo.save).not.toHaveBeenCalled();
    expect(result.isNewUser).toBe(false);
    expect(result.onboardingCompleted).toBe(true);
  });

  it('refresh: 저장된 해시와 불일치하면 401', async () => {
    tokens.verifyRefresh = jest.fn().mockResolvedValue({ sub: 'user-1' });
    refreshStore.matches.mockResolvedValue(false);

    await expect(service.refresh('bad')).rejects.toBeInstanceOf(AppException);
  });

  it('refresh: 일치하면 새 토큰 쌍을 회전 발급', async () => {
    tokens.verifyRefresh = jest.fn().mockResolvedValue({ sub: 'user-1' });
    refreshStore.matches.mockResolvedValue(true);

    const result = await service.refresh('good');

    expect(result.accessToken).toBe('access');
    expect(refreshStore.save).toHaveBeenCalledWith('user-1', 'refresh', 1000);
  });
});
