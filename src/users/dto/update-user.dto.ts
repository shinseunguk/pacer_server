import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateUserDto {
  /** 빈값·길이 검증은 422로 응답해야 하므로 서비스에서 처리한다. */
  @ApiProperty({ example: '새닉네임', description: '표시 닉네임 (1~20자)' })
  @IsString()
  nickname: string;
}
