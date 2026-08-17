import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { UsageService } from './usage.service';

const USER_ID = 'user-1';
const DAILY_LIMIT = 20;

interface Repo {
  create: jest.Mock;
  save: jest.Mock;
  findOne: jest.Mock;
  increment: jest.Mock;
}

interface RedisClient {
  get: jest.Mock;
  incr: jest.Mock;
  expire: jest.Mock;
}

describe('UsageService', () => {
  let usageRepo: Repo;
  let client: RedisClient;
  let service: UsageService;

  beforeEach(() => {
    usageRepo = {
      create: jest.fn((v: Record<string, unknown>) => v),
      save: jest.fn((v: Record<string, unknown>) => Promise.resolve(v)),
      findOne: jest.fn().mockResolvedValue(null),
      increment: jest.fn().mockResolvedValue(undefined),
    };
    client = {
      get: jest.fn().mockResolvedValue(null),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };

    const redis = { getClient: () => client } as unknown as RedisService;
    const config = {
      get: (_key: string, fallback: number) => fallback,
    } as unknown as ConfigService;

    service = new UsageService(usageRepo as never, redis, config);
  });

  describe('consumeBaseQuestion', () => {
    it('첫 사용이면 Redis 카운터에 자정 TTL을 걸고 DB 행을 만든다', async () => {
      const count = await service.consumeBaseQuestion(USER_ID);

      expect(count).toBe(1);
      expect(client.incr).toHaveBeenCalledTimes(1);
      expect(client.expire).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
      );
      expect(usageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ baseQuestionCount: 1 }),
      );
    });

    it('두 번째부터는 TTL을 다시 걸지 않고 DB 카운트를 증가시킨다', async () => {
      client.incr.mockResolvedValue(2);
      usageRepo.findOne.mockResolvedValue({
        id: 'usage-1',
        baseQuestionCount: 1,
      });

      const count = await service.consumeBaseQuestion(USER_ID);

      expect(count).toBe(2);
      expect(client.expire).not.toHaveBeenCalled();
      expect(usageRepo.increment).toHaveBeenCalledWith(
        { id: 'usage-1' },
        'baseQuestionCount',
        1,
      );
    });

    it('Redis가 죽어도 DB 백업으로 카운트를 이어간다', async () => {
      client.incr.mockRejectedValue(new Error('redis down'));
      usageRepo.findOne.mockResolvedValue({
        id: 'usage-1',
        baseQuestionCount: 4,
      });

      const count = await service.consumeBaseQuestion(USER_ID);

      expect(count).toBe(4);
      expect(usageRepo.increment).toHaveBeenCalled();
    });
  });

  describe('getTodaySummary', () => {
    it('Redis 카운터를 우선 사용한다', async () => {
      client.get.mockResolvedValue('5');

      const summary = await service.getTodaySummary(USER_ID);

      expect(summary.baseQuestionUsed).toBe(5);
      expect(summary.limit).toBe(DAILY_LIMIT);
      expect(summary.remaining).toBe(15);
      expect(usageRepo.findOne).not.toHaveBeenCalled();
    });

    it('Redis에 값이 없으면 DB 백업을 읽는다', async () => {
      usageRepo.findOne.mockResolvedValue({ baseQuestionCount: 7 });

      const summary = await service.getTodaySummary(USER_ID);

      expect(summary.baseQuestionUsed).toBe(7);
      expect(summary.remaining).toBe(13);
    });

    it('한도를 넘겨도 remaining은 음수가 되지 않는다', async () => {
      client.get.mockResolvedValue('25');

      const summary = await service.getTodaySummary(USER_ID);

      expect(summary.remaining).toBe(0);
    });
  });
});
