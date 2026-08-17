import { ConfigService } from '@nestjs/config';
import { PrivacyPurgeService } from './privacy-purge.service';

const RETENTION_DAYS = 90;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-15T00:00:00Z');

interface UserRepo {
  find: jest.Mock;
  delete: jest.Mock;
}

interface QueryBuilderMock {
  update: jest.Mock;
  set: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  execute: jest.Mock;
}

interface SessionRepo {
  createQueryBuilder: jest.Mock;
}

/** UpdateQueryBuilder 체인 목 — 각 단계는 자기 자신을, execute만 결과를 돌려준다. */
function createQueryBuilder(affected: number): QueryBuilderMock {
  const builder: QueryBuilderMock = {
    update: jest.fn(),
    set: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    execute: jest.fn().mockResolvedValue({ affected }),
  };

  builder.update.mockReturnValue(builder);
  builder.set.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.andWhere.mockReturnValue(builder);
  return builder;
}

describe('PrivacyPurgeService', () => {
  let userRepo: UserRepo;
  let builder: QueryBuilderMock;
  let service: PrivacyPurgeService;

  function createService(affected = 0): void {
    builder = createQueryBuilder(affected);
    const sessionRepo: SessionRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    };
    const config = {
      get: (_key: string, fallback: number) => fallback,
    } as unknown as ConfigService;

    service = new PrivacyPurgeService(
      userRepo as never,
      sessionRepo as never,
      config,
    );
  }

  beforeEach(() => {
    userRepo = {
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    createService();
  });

  describe('탈퇴 계정 파기', () => {
    it('soft delete된 계정을 실제로 삭제한다', async () => {
      userRepo.find.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]);

      const count = await service.purgeWithdrawnUsers();

      expect(count).toBe(2);
      expect(userRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ withDeleted: true }),
      );
      expect(userRepo.delete).toHaveBeenCalledWith(['user-1', 'user-2']);
    });

    it('대상이 없으면 삭제를 호출하지 않는다', async () => {
      await expect(service.purgeWithdrawnUsers()).resolves.toBe(0);
      expect(userRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('민감 원문 파기', () => {
    it('보관 기간이 지난 세션의 원문만 비운다', async () => {
      createService(3);

      const count = await service.purgeExpiredSensitiveData(NOW);

      expect(count).toBe(3);
      expect(builder.set).toHaveBeenCalledWith({
        jobPostingText: null,
        applicantInfo: null,
        resumeRef: null,
      });

      const [, params] = builder.where.mock.calls[0] as [
        string,
        { threshold: Date },
      ];
      expect(params.threshold).toEqual(
        new Date(NOW.getTime() - RETENTION_DAYS * DAY_IN_MS),
      );
    });

    it('이미 비워진 행은 건너뛰도록 조건을 건다', async () => {
      await service.purgeExpiredSensitiveData(NOW);

      expect(builder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('job_posting_text IS NOT NULL'),
      );
    });
  });

  it('일일 배치는 두 작업을 모두 수행하고 요약을 돌려준다', async () => {
    createService(2);
    userRepo.find.mockResolvedValue([{ id: 'user-1' }]);

    await expect(service.runDailyPurge()).resolves.toEqual({
      withdrawnUsers: 1,
      sensitiveSessions: 2,
    });
  });
});
