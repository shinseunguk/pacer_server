import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Entitlement } from './entities/entitlement.entity';
import { Product } from './entities/product.entity';
import { Purchase } from './entities/purchase.entity';
import { RECEIPT_VERIFIER } from './receipt-verifier';
import { StubReceiptVerifier } from './stub-receipt-verifier';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

/**
 * 이용권·결제.
 * 지금은 스텁 검증기를 주입하고, 스토어 키가 확보되면 애플·구글 어댑터로 교체한다.
 * 소비 측(interviews)은 SubscriptionsService만 알면 되므로 교체 영향이 없다.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Entitlement, Purchase, Product])],
  providers: [
    SubscriptionsService,
    { provide: RECEIPT_VERIFIER, useClass: StubReceiptVerifier },
  ],
  controllers: [SubscriptionsController],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
