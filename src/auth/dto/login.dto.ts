import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: '공급자 id token / access token' })
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @ApiPropertyOptional({ description: 'nonce (애플 등)' })
  @IsOptional()
  @IsString()
  nonce?: string;
}
