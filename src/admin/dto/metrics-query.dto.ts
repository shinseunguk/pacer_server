import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PERIOD_DAYS = 30;
export const MAX_PERIOD_DAYS = 365;

export class MetricsQueryDto {
  @ApiPropertyOptional({
    description: '오늘로부터 며칠치를 집계할지',
    default: DEFAULT_PERIOD_DAYS,
    minimum: 1,
    maximum: MAX_PERIOD_DAYS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PERIOD_DAYS)
  days?: number;
}
