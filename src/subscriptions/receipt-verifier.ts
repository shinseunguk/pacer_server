import { PurchasePlatform } from './entities/purchase.entity';

/**
 * 스토어 영수증 검증의 포트.
 *
 * 애플·구글 키가 없어도 구매→이용권→면접 전 구간을 완성하기 위해 포트를 먼저 둔다
 * (ADR 0003의 InterviewEngine과 같은 패턴). 실어댑터가 붙어도 소비 측은 바뀌지 않는다.
 */
export const RECEIPT_VERIFIER = 'RECEIPT_VERIFIER';

export interface VerifyReceiptInput {
  platform: PurchasePlatform;
  receipt: string;
  productSku: string;
}

/** 검증된 거래. 스토어가 진실의 원천이므로 만료·갱신 여부는 여기서 온다. */
export interface VerifiedPurchase {
  transactionId: string;
  originalTransactionId: string;
  productSku: string;
  purchasedAt: Date;
  expiresAt: Date;
  autoRenewing: boolean;
  environment: 'sandbox' | 'production';
}

/** 스토어 서버 알림(갱신·해지·환불)이 알려주는 상태 변화. */
export interface VerifiedNotification {
  originalTransactionId: string;
  type: 'renewed' | 'canceled' | 'refunded' | 'expired';
  expiresAt: Date | null;
  autoRenewing: boolean;
}

export interface ReceiptVerifier {
  verify(input: VerifyReceiptInput): Promise<VerifiedPurchase>;
  /** 스토어가 보낸 알림 payload의 서명을 검증하고 의미를 뽑는다. */
  verifyNotification(payload: unknown): Promise<VerifiedNotification>;
}
