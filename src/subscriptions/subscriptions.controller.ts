import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { VerifyPurchaseDto } from './dto/verify-purchase.dto';
import { EntitlementView, SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('me')
  @ApiOperation({ summary: '내 이용권 상태 (무료 잔여 횟수 포함)' })
  getMine(@CurrentUser() user: AuthUser): Promise<EntitlementView> {
    return this.subscriptions.getEntitlement(user.userId);
  }

  @Post('verify')
  @ApiOperation({ summary: '영수증 검증 → 이용권 부여 (멱등)' })
  verify(
    @CurrentUser() user: AuthUser,
    @Body() dto: VerifyPurchaseDto,
  ): Promise<EntitlementView> {
    return this.subscriptions.verifyPurchase(
      user.userId,
      dto.platform,
      dto.receipt,
      dto.productId,
    );
  }

  @Post('restore')
  @ApiOperation({ summary: '구매 복원' })
  restore(
    @CurrentUser() user: AuthUser,
    @Body() dto: VerifyPurchaseDto,
  ): Promise<EntitlementView> {
    return this.subscriptions.restore(
      user.userId,
      dto.platform,
      dto.receipt,
      dto.productId,
    );
  }

  /**
   * 스토어 서버 알림 (갱신·해지·환불·만료).
   *
   * 스토어가 호출하므로 사용자 인증이 없다. 대신 **payload 서명을 검증기가 확인**한다.
   * 200을 돌려주지 않으면 스토어가 재시도하므로, 알 수 없는 거래도 200으로 받고 넘긴다.
   */
  @Public()
  @Post('notifications')
  @HttpCode(200)
  @ApiOperation({ summary: '스토어 서버 알림 수신' })
  async notify(@Body() payload: unknown): Promise<{ received: true }> {
    await this.subscriptions.applyNotification(payload);
    return { received: true };
  }
}
