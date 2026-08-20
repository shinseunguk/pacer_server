import { ConfigService } from '@nestjs/config';
import { StubReceiptVerifier } from './stub-receipt-verifier';

function verifier(nodeEnv: string): StubReceiptVerifier {
  return new StubReceiptVerifier({
    get: () => nodeEnv,
  } as unknown as ConfigService);
}

describe('StubReceiptVerifier', () => {
  it('stub: 형식의 영수증을 승인한다', async () => {
    const result = await verifier('development').verify({
      platform: 'stub',
      receipt: 'stub:txn-9',
      productSku: 'pro_monthly',
    });

    expect(result.transactionId).toBe('txn-9');
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('형식이 다르면 거부한다', async () => {
    await expect(
      verifier('development').verify({
        platform: 'stub',
        receipt: 'garbage',
        productSku: 'pro_monthly',
      }),
    ).rejects.toThrow('영수증을 확인하지 못했어요.');
  });

  it('운영에서는 어떤 영수증도 승인하지 않는다', async () => {
    // 실어댑터 전에 배포되면 누구나 아무 문자열로 구독을 얻는다.
    await expect(
      verifier('production').verify({
        platform: 'stub',
        receipt: 'stub:txn-9',
        productSku: 'pro_monthly',
      }),
    ).rejects.toThrow('결제 검증을 사용할 수 없어요.');
  });

  it('운영에서는 알림도 받지 않는다', async () => {
    await expect(
      verifier('production').verifyNotification({
        originalTransactionId: 'txn-9',
        type: 'refunded',
      }),
    ).rejects.toThrow('결제 검증을 사용할 수 없어요.');
  });

  it('알림 형식이 어긋나면 거부한다', async () => {
    await expect(
      verifier('development').verifyNotification({ type: 'refunded' }),
    ).rejects.toThrow('알림 형식이 올바르지 않아요.');
  });
});
