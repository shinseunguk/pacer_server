import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import {
  PURCHASE_PLATFORMS,
  PurchasePlatform,
} from '../entities/purchase.entity';

/** 영수증 원문 상한. 애플 영수증은 수십 KB까지 커진다. */
const MAX_RECEIPT_LENGTH = 100_000;

export class VerifyPurchaseDto {
  @ApiProperty({ enum: PURCHASE_PLATFORMS })
  @IsIn(PURCHASE_PLATFORMS)
  platform: PurchasePlatform;

  @ApiProperty({ description: '스토어 영수증(base64)' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_RECEIPT_LENGTH)
  receipt: string;

  @ApiProperty({ example: 'pro_monthly' })
  @IsString()
  @MaxLength(100)
  productId: string;
}
