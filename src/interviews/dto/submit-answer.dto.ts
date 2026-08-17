import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export const MAX_ANSWER_LENGTH = 5000;

/** 답변 제출 (API 명세 §5 POST /interviews/{id}/answer). */
export class SubmitAnswerDto {
  @ApiProperty({ maxLength: MAX_ANSWER_LENGTH })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_ANSWER_LENGTH)
  content: string;
}
