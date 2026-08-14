import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsObject, IsString, ValidateNested } from 'class-validator';

/**
 * 동의 항목. terms·privacy·llmConsent는 필수 동의이며,
 * "false로 들어온 경우"는 형식 오류가 아니라 정책 위반이므로 서비스에서 400으로 처리한다.
 */
export class AgreementsDto {
  @ApiProperty({ description: '이용약관 동의 (필수)' })
  @IsBoolean()
  terms: boolean;

  @ApiProperty({ description: '개인정보 처리 동의 (필수)' })
  @IsBoolean()
  privacy: boolean;

  @ApiProperty({ description: 'LLM 전송 고지 동의 (필수)' })
  @IsBoolean()
  llmConsent: boolean;

  @ApiProperty({ description: '마케팅 수신 동의 (선택)', required: false })
  @IsBoolean()
  marketing: boolean = false;
}

export class OnboardingDto {
  /** 빈값 검증은 422로 응답해야 하므로 여기서는 타입만 확인한다. */
  @ApiProperty({ example: '승욱', description: '표시 닉네임 (1~20자)' })
  @IsString()
  nickname: string;

  @ApiProperty({ type: AgreementsDto })
  @IsObject()
  @ValidateNested()
  @Type(() => AgreementsDto)
  agreements: AgreementsDto;
}
