import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 50;

/** 히스토리 목록 (API 명세 §5 GET /interviews) — 커서 기반. */
export class ListInterviewsDto {
  @ApiPropertyOptional({ default: DEFAULT_LIST_LIMIT, maximum: MAX_LIST_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIST_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ description: '이전 응답의 nextCursor (세션 id)' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
