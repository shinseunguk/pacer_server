import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { User } from '../users/entities/user.entity';
import { Entitlement } from './entities/entitlement.entity';
import { Product } from './entities/product.entity';
import {
  Purchase,
  PurchasePlatform,
  PurchaseStatus,
} from './entities/purchase.entity';
import {
  RECEIPT_VERIFIER,
  ReceiptVerifier,
  VerifiedNotification,
  VerifiedPurchase,
} from './receipt-verifier';

/** 무료로 진행할 수 있는 면접 수 — 평생 누적이며 리셋되지 않는다. */
export const FREE_INTERVIEW_LIMIT = 2;

/** 무료 사용자가 고를 수 있는 문항 수. 프리셋 '빠른 연습'과 같다. */
export const FREE_QUESTION_COUNT = 5;

export interface EntitlementView {
  plan: 'free' | 'pro';
  isPro: boolean;
  expiresAt: string | null;
  autoRenewing: boolean;
  freeInterviewsUsed: number;
  freeInterviewsRemaining: number;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(Entitlement)
    private readonly entitlements: Repository<Entitlement>,
    @InjectRepository(Purchase)
    private readonly purchases: Repository<Purchase>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @Inject(RECEIPT_VERIFIER)
    private readonly verifier: ReceiptVerifier,
  ) {}

  /**
   * 영수증 검증 → 이용권 부여. **멱등하다.**
   *
   * 앱은 네트워크 실패나 복원 흐름에서 같은 영수증을 다시 보낸다. 거래 ID에
   * 유니크 제약이 걸려 있어 두 번째 호출은 기존 거래를 찾아 같은 상태를 돌려준다.
   */
  async verifyPurchase(
    userId: string,
    platform: PurchasePlatform,
    receipt: string,
    productSku: string,
  ): Promise<EntitlementView> {
    await this.assertProductOnSale(productSku);

    const verified = await this.verifier.verify({
      platform,
      receipt,
      productSku,
    });

    const existing = await this.purchases.findOne({
      where: { platform, transactionId: verified.transactionId },
      relations: { user: true },
    });

    if (existing) {
      // 남의 거래를 자기 계정에 붙이려는 시도는 막는다.
      if (existing.user.id !== userId) {
        throw new AppException(
          'RECEIPT_ALREADY_USED',
          '이미 다른 계정에서 사용된 영수증이에요.',
          HttpStatus.CONFLICT,
        );
      }
      return this.viewOf(await this.loadOrCreate(userId));
    }

    await this.purchases.save(
      this.purchases.create({
        user: { id: userId } as User,
        productSku: verified.productSku,
        platform,
        transactionId: verified.transactionId,
        originalTransactionId: verified.originalTransactionId,
        purchasedAt: verified.purchasedAt,
        expiresAt: verified.expiresAt,
        status: 'active',
        environment: verified.environment,
      }),
    );

    return this.viewOf(await this.grantPro(userId, verified));
  }

  /** 복원 — 검증과 같은 경로다. 스토어가 진실의 원천이므로 별도 분기가 필요 없다. */
  restore(
    userId: string,
    platform: PurchasePlatform,
    receipt: string,
    productSku: string,
  ): Promise<EntitlementView> {
    return this.verifyPurchase(userId, platform, receipt, productSku);
  }

  async getEntitlement(userId: string): Promise<EntitlementView> {
    return this.viewOf(await this.loadOrCreate(userId));
  }

  /**
   * 스토어 알림 반영 (갱신·해지·환불·만료).
   *
   * 해지(canceled)는 **즉시 회수하지 않는다** — 사용자는 이미 낸 기간까지 쓸 권리가 있다.
   * 자동갱신만 끄고 만료 시점에 자연히 free로 떨어지게 둔다. 환불은 즉시 회수한다.
   */
  async applyNotification(payload: unknown): Promise<void> {
    const notification = await this.verifier.verifyNotification(payload);
    const purchase = await this.latestPurchaseOf(
      notification.originalTransactionId,
    );

    if (!purchase) {
      this.logger.warn(
        `알 수 없는 거래의 알림을 무시합니다 (original=${notification.originalTransactionId})`,
      );
      return;
    }

    const status = statusFor(notification.type);
    await this.purchases.update({ id: purchase.id }, { status });

    const entitlement = await this.loadOrCreate(purchase.user.id);
    await this.entitlements.update(
      { id: entitlement.id },
      applyToEntitlement(notification),
    );
  }

  /**
   * 면접을 시작할 수 있는지 판정하고, 무료면 잔여 횟수를 소진한다.
   *
   * 판정과 소진을 한 곳에 두는 이유: 떨어뜨려 놓으면 "확인은 했는데 안 깎는" 경로가
   * 생기고, 그건 무료로 무한히 쓰는 구멍이 된다.
   */
  async consumeInterviewCredit(
    userId: string,
    questionCount: number,
  ): Promise<void> {
    const entitlement = await this.loadOrCreate(userId);

    if (isProActive(entitlement)) return;

    if (questionCount > FREE_QUESTION_COUNT) {
      throw new AppException(
        'PLAN_REQUIRED',
        `무료로는 ${FREE_QUESTION_COUNT}문항 면접만 진행할 수 있어요. 구독하면 더 길게 연습할 수 있어요.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    if (entitlement.freeInterviewsUsed >= FREE_INTERVIEW_LIMIT) {
      throw new AppException(
        'FREE_QUOTA_EXCEEDED',
        `무료 면접 ${FREE_INTERVIEW_LIMIT}회를 모두 사용했어요. 구독하면 계속 연습할 수 있어요.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    await this.entitlements.increment(
      { id: entitlement.id },
      'freeInterviewsUsed',
      1,
    );
  }

  private async assertProductOnSale(sku: string): Promise<void> {
    const product = await this.products.findOne({ where: { sku } });
    if (!product?.isActive) {
      throw new AppException(
        'PRODUCT_NOT_FOUND',
        '판매 중인 상품이 아니에요.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private async grantPro(
    userId: string,
    verified: VerifiedPurchase,
  ): Promise<Entitlement> {
    const entitlement = await this.loadOrCreate(userId);

    await this.entitlements.update(
      { id: entitlement.id },
      {
        plan: 'pro',
        expiresAt: verified.expiresAt,
        autoRenewing: verified.autoRenewing,
      },
    );

    return this.loadOrCreate(userId);
  }

  private async loadOrCreate(userId: string): Promise<Entitlement> {
    const existing = await this.entitlements.findOne({
      where: { user: { id: userId } },
    });
    if (existing) return existing;

    return this.entitlements.save(
      this.entitlements.create({ user: { id: userId } as User }),
    );
  }

  private latestPurchaseOf(
    originalTransactionId: string,
  ): Promise<Purchase | null> {
    return this.purchases.findOne({
      where: { originalTransactionId },
      relations: { user: true },
      order: { purchasedAt: 'DESC' },
    });
  }

  private viewOf(entitlement: Entitlement): EntitlementView {
    const isPro = isProActive(entitlement);
    const used = entitlement.freeInterviewsUsed;

    return {
      plan: isPro ? 'pro' : 'free',
      isPro,
      expiresAt: entitlement.expiresAt?.toISOString() ?? null,
      autoRenewing: entitlement.autoRenewing,
      freeInterviewsUsed: used,
      freeInterviewsRemaining: Math.max(0, FREE_INTERVIEW_LIMIT - used),
    };
  }
}

/**
 * 만료 시각이 지났으면 plan이 'pro'로 남아 있어도 무료로 본다.
 * 스토어 알림이 유실되거나 늦게 와도 만료된 구독으로 계속 쓰이지 않게 하는 안전장치다.
 */
export function isProActive(entitlement: Entitlement): boolean {
  if (entitlement.plan !== 'pro') return false;
  if (!entitlement.expiresAt) return false;
  return entitlement.expiresAt.getTime() > Date.now();
}

function statusFor(type: VerifiedNotification['type']): PurchaseStatus {
  switch (type) {
    case 'renewed':
      return 'active';
    case 'canceled':
      return 'canceled';
    case 'refunded':
      return 'refunded';
    case 'expired':
      return 'expired';
  }
}

function applyToEntitlement(
  notification: VerifiedNotification,
): Partial<Entitlement> {
  // 환불은 낸 돈이 돌아간 것이므로 즉시 회수한다.
  if (notification.type === 'refunded') {
    return { plan: 'free', expiresAt: null, autoRenewing: false };
  }

  if (notification.type === 'expired') {
    return { plan: 'free', expiresAt: null, autoRenewing: false };
  }

  // 갱신·해지는 만료 시각과 자동갱신 여부만 갱신한다.
  return {
    expiresAt: notification.expiresAt,
    autoRenewing: notification.autoRenewing,
  };
}
