import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/exceptions/app.exception';
import {
  ReceiptVerifier,
  VerifiedNotification,
  VerifiedPurchase,
  VerifyReceiptInput,
} from './receipt-verifier';

const MONTH_IN_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 스토어 계정 없이 구매 흐름을 끝까지 돌리기 위한 스텁 검증기.
 *
 * **운영에서는 절대 동작하지 않는다.** 실어댑터를 붙이기 전에 배포되면 누구나
 * 아무 문자열로 구독을 얻게 되므로, production이면 무조건 거부한다.
 *
 * 영수증 형식: `stub:<transactionId>` (원거래 ID는 transactionId와 동일하게 본다)
 */
@Injectable()
export class StubReceiptVerifier implements ReceiptVerifier {
  private readonly logger = new Logger(StubReceiptVerifier.name);

  constructor(private readonly config: ConfigService) {}

  // Promise를 반환한다고 선언한 이상 동기적으로 던지면 안 된다 —
  // await 없이 .catch()로 받는 호출부에서 예외가 그대로 터진다.
  // 스텁이라 await할 대상이 없을 뿐, 실어댑터는 네트워크를 기다린다.
  // eslint-disable-next-line @typescript-eslint/require-await
  async verify(input: VerifyReceiptInput): Promise<VerifiedPurchase> {
    this.assertNotProduction();

    const transactionId = parseStubReceipt(input.receipt);
    const purchasedAt = new Date();

    this.logger.warn(
      `스텁 검증기로 구매를 승인합니다 (transaction=${transactionId}). 실어댑터 연결 전에만 쓰입니다.`,
    );

    return {
      transactionId,
      originalTransactionId: transactionId,
      productSku: input.productSku,
      purchasedAt,
      expiresAt: new Date(purchasedAt.getTime() + MONTH_IN_MS),
      autoRenewing: true,
      environment: 'sandbox',
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async verifyNotification(payload: unknown): Promise<VerifiedNotification> {
    this.assertNotProduction();

    const body = payload as Partial<VerifiedNotification> | null;
    if (!body?.originalTransactionId || !body.type) {
      throw new AppException(
        'INVALID_NOTIFICATION',
        '알림 형식이 올바르지 않아요.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      originalTransactionId: body.originalTransactionId,
      type: body.type,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      autoRenewing: body.autoRenewing ?? false,
    };
  }

  private assertNotProduction(): void {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new AppException(
        'VERIFIER_NOT_CONFIGURED',
        '결제 검증을 사용할 수 없어요.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}

function parseStubReceipt(receipt: string): string {
  const [prefix, id] = receipt.split(':');
  if (prefix !== 'stub' || !id) {
    throw new AppException(
      'RECEIPT_INVALID',
      '영수증을 확인하지 못했어요.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
  return id;
}
