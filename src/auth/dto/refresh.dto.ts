import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'refresh 토큰' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
