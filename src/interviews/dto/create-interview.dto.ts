import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const JOB_SOURCES = ['paste', 'template'] as const;
export const INTERVIEW_TYPES = ['general', 'pressure'] as const;
export const DIFFICULTIES = ['low', 'mid', 'high'] as const;
export const LANGUAGES = ['ko'] as const;

/**
 * 직무 질문 수의 범위. 도입 질문(자기소개·지원동기) 2개는 여기 포함되지 않는다
 * (프롬프트 설계 §3).
 *
 * 하한 5: 3~4문항은 면접이라 부르기 어렵다.
 * 상한 15: 텍스트 채팅은 말보다 느려 그 이상은 완주율이 무너진다(MVP KPI §6).
 */
export const MIN_QUESTION_COUNT = 5;
export const MAX_QUESTION_COUNT = 15;

/**
 * 면접 세션 생성 입력 (API 명세 §5 POST /interviews).
 *
 * Phase A(MVP) 범위로 좁힌 부분 — 나머지는 P1:
 * - jobSource: `url`(공고 자동 파싱) 제외
 * - interviewType: 인성·직무·임원 제외, 일반·압박 2종
 * - persona / realtimeFeedback / 영어 면접 제외
 */
export class CreateInterviewDto {
  @ApiProperty({ enum: JOB_SOURCES })
  @IsIn(JOB_SOURCES)
  jobSource: (typeof JOB_SOURCES)[number];

  @ApiPropertyOptional({ description: 'jobSource=paste일 때 필수 (공고 원문)' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  jobPostingText?: string;

  @ApiPropertyOptional({
    description: 'jobSource=template일 때 필수 (세부 직무)',
  })
  @IsOptional()
  @IsUUID()
  jobRoleId?: string;

  @ApiPropertyOptional({ description: '목록에 없는 직무 직접 입력' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customRole?: string;

  @ApiPropertyOptional({ description: '경력·자기소개 (권장, 민감정보)' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  applicantInfo?: string;

  @ApiPropertyOptional({ description: '저장된 이력서 참조' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  resumeRef?: string;

  @ApiProperty({ enum: INTERVIEW_TYPES })
  @IsIn(INTERVIEW_TYPES)
  interviewType: (typeof INTERVIEW_TYPES)[number];

  @ApiProperty({ enum: DIFFICULTIES })
  @IsIn(DIFFICULTIES)
  difficulty: (typeof DIFFICULTIES)[number];

  @ApiPropertyOptional({ enum: LANGUAGES, default: 'ko' })
  @IsOptional()
  @IsIn(LANGUAGES)
  language?: (typeof LANGUAGES)[number];

  @ApiProperty({ minimum: MIN_QUESTION_COUNT, maximum: MAX_QUESTION_COUNT })
  @IsInt()
  @Min(MIN_QUESTION_COUNT)
  @Max(MAX_QUESTION_COUNT)
  questionCount: number;

  @ApiPropertyOptional({ default: true, description: '리포트 점수 표시 여부' })
  @IsOptional()
  @IsBoolean()
  showScore?: boolean;
}
