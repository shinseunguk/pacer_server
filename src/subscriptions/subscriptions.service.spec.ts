import { Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { Entitlement } from './entities/entitlement.entity';
import { Product } from './entities/product.entity';
import { Purchase } from './entities/purchase.entity';
import {
  FREE_INTERVIEW_LIMIT,
  FREE_QUESTION_COUNT,
  SubscriptionsService,
} from './subscriptions.service';

const HOUR = 60 * 60 * 1000;

function entitlement(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    id: 'ent-1',
    user: { id: 'user-1' },
    plan: 'free',
    expiresAt: null,
    autoRenewing: false,
    freeInterviewsUsed: 0,
    updatedAt: new Date(),
    ...overrides,
  } as Entitlement;
}

describe('SubscriptionsService', () => {
  let entitlements: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    increment: jest.Mock;
  };
  let purchases: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  let products: { findOne: jest.Mock };
  let verifier: { verify: jest.Mock; verifyNotification: jest.Mock };
  let service: SubscriptionsService;

  const verified = {
    transactionId: 'txn-1',
    originalTransactionId: 'txn-1',
    productSku: 'pro_monthly',
    purchasedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * HOUR),
    autoRenewing: true,
    environment: 'sandbox' as const,
  };

  beforeEach(() => {
    entitlements = {
      findOne: jest.fn().mockResolvedValue(entitlement()),
      save: jest
        .fn()
        .mockImplementation((value: unknown) => Promise.resolve(value)),
      create: jest.fn().mockImplementation((value: unknown) => value),
      update: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(undefined),
    };
    purchases = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockImplementation((value: unknown) => value),
      update: jest.fn().mockResolvedValue(undefined),
    };
    products = {
      findOne: jest
        .fn()
        .mockResolvedValue({ sku: 'pro_monthly', isActive: true }),
    };
    verifier = {
      verify: jest.fn().mockResolvedValue(verified),
      verifyNotification: jest.fn(),
    };

    service = new SubscriptionsService(
      entitlements as unknown as Repository<Entitlement>,
      purchases as unknown as Repository<Purchase>,
      products as unknown as Repository<Product>,
      verifier,
    );
  });

  describe('영수증 검증', () => {
    it('검증에 성공하면 거래를 남기고 pro를 부여한다', async () => {
      entitlements.findOne
        .mockResolvedValueOnce(entitlement())
        .mockResolvedValue(
          entitlement({ plan: 'pro', expiresAt: verified.expiresAt }),
        );

      const view = await service.verifyPurchase(
        'user-1',
        'stub',
        'stub:txn-1',
        'pro_monthly',
      );

      expect(purchases.save).toHaveBeenCalled();
      expect(view.isPro).toBe(true);
    });

    it('같은 영수증을 두 번 보내도 거래를 두 번 만들지 않는다', async () => {
      // 앱은 네트워크 재시도·복원에서 같은 영수증을 다시 보낸다.
      purchases.findOne.mockResolvedValue({
        id: 'p-1',
        user: { id: 'user-1' },
      });

      await service.verifyPurchase(
        'user-1',
        'stub',
        'stub:txn-1',
        'pro_monthly',
      );

      expect(purchases.save).not.toHaveBeenCalled();
    });

    it('남의 영수증을 자기 계정에 붙이려 하면 막는다', async () => {
      purchases.findOne.mockResolvedValue({
        id: 'p-1',
        user: { id: 'someone-else' },
      });

      await expect(
        service.verifyPurchase('user-1', 'stub', 'stub:txn-1', 'pro_monthly'),
      ).rejects.toThrow(AppException);
    });

    it('판매 중이 아닌 상품은 검증을 시도하지 않는다', async () => {
      products.findOne.mockResolvedValue(null);

      await expect(
        service.verifyPurchase('user-1', 'stub', 'stub:txn-1', 'gone'),
      ).rejects.toThrow('판매 중인 상품이 아니에요.');
      expect(verifier.verify).not.toHaveBeenCalled();
    });
  });

  describe('면접 이용권', () => {
    it('구독 중이면 문항 수와 무관하게 통과하고 무료 횟수를 깎지 않는다', async () => {
      entitlements.findOne.mockResolvedValue(
        entitlement({ plan: 'pro', expiresAt: new Date(Date.now() + HOUR) }),
      );

      await service.consumeInterviewCredit('user-1', 15);

      expect(entitlements.increment).not.toHaveBeenCalled();
    });

    it('무료는 5문항까지만 — 그 이상은 402', async () => {
      await expect(
        service.consumeInterviewCredit('user-1', FREE_QUESTION_COUNT + 1),
      ).rejects.toThrow(/무료로는/);
    });

    it('무료 2회를 다 쓰면 402', async () => {
      entitlements.findOne.mockResolvedValue(
        entitlement({ freeInterviewsUsed: FREE_INTERVIEW_LIMIT }),
      );

      await expect(
        service.consumeInterviewCredit('user-1', FREE_QUESTION_COUNT),
      ).rejects.toThrow(/모두 사용했어요/);
    });

    it('무료로 통과하면 잔여 횟수를 깎는다', async () => {
      await service.consumeInterviewCredit('user-1', FREE_QUESTION_COUNT);

      expect(entitlements.increment).toHaveBeenCalledWith(
        { id: 'ent-1' },
        'freeInterviewsUsed',
        1,
      );
    });

    it('만료된 pro는 무료로 취급한다', async () => {
      // 스토어 알림이 유실되거나 늦게 와도 만료된 구독으로 계속 쓰이면 안 된다.
      entitlements.findOne.mockResolvedValue(
        entitlement({
          plan: 'pro',
          expiresAt: new Date(Date.now() - HOUR),
          freeInterviewsUsed: FREE_INTERVIEW_LIMIT,
        }),
      );

      await expect(
        service.consumeInterviewCredit('user-1', FREE_QUESTION_COUNT),
      ).rejects.toThrow(/모두 사용했어요/);
    });
  });

  describe('스토어 알림', () => {
    beforeEach(() => {
      purchases.findOne.mockResolvedValue({
        id: 'p-1',
        user: { id: 'user-1' },
      });
    });

    it('환불은 즉시 회수한다', async () => {
      verifier.verifyNotification.mockResolvedValue({
        originalTransactionId: 'txn-1',
        type: 'refunded',
        expiresAt: null,
        autoRenewing: false,
      });

      await service.applyNotification({});

      expect(entitlements.update).toHaveBeenCalledWith(
        { id: 'ent-1' },
        expect.objectContaining({ plan: 'free' }),
      );
    });

    it('해지는 즉시 회수하지 않고 자동갱신만 끈다', async () => {
      // 이미 낸 기간까지는 쓸 권리가 있다.
      const expiresAt = new Date(Date.now() + 10 * 24 * HOUR);
      verifier.verifyNotification.mockResolvedValue({
        originalTransactionId: 'txn-1',
        type: 'canceled',
        expiresAt,
        autoRenewing: false,
      });

      await service.applyNotification({});

      expect(entitlements.update).toHaveBeenCalledWith(
        { id: 'ent-1' },
        { expiresAt, autoRenewing: false },
      );
    });

    it('알 수 없는 거래의 알림은 조용히 무시한다', async () => {
      // 200을 돌려주지 않으면 스토어가 계속 재시도한다.
      purchases.findOne.mockResolvedValue(null);
      verifier.verifyNotification.mockResolvedValue({
        originalTransactionId: 'unknown',
        type: 'renewed',
        expiresAt: new Date(),
        autoRenewing: true,
      });

      await expect(service.applyNotification({})).resolves.toBeUndefined();
      expect(entitlements.update).not.toHaveBeenCalled();
    });
  });
});
