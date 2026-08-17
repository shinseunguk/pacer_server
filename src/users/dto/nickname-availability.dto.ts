import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** 넉넉히 잡은 상한 — 실제 길이 판정은 grapheme 기준으로 서비스에서 한다. */
const RAW_MAX_LENGTH = 100;

export class NicknameAvailabilityQueryDto {
  @ApiProperty({ description: '확인할 닉네임' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(RAW_MAX_LENGTH)
  nickname: string;
}
