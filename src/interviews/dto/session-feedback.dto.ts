import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const FEEDBACK_RATINGS = ['up', 'down'] as const;
export type FeedbackRating = (typeof FEEDBACK_RATINGS)[number];

export const MAX_FEEDBACK_COMMENT_LENGTH = 500;

/** 리포트 만족도 제출 (`POST /interviews/{id}/feedback`). */
export class SubmitFeedbackDto {
  @ApiProperty({ enum: FEEDBACK_RATINGS })
  @IsIn(FEEDBACK_RATINGS)
  rating: FeedbackRating;

  @ApiPropertyOptional({
    description: '👎일 때 받는 이유(선택)',
    maxLength: MAX_FEEDBACK_COMMENT_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_FEEDBACK_COMMENT_LENGTH)
  comment?: string;
}
