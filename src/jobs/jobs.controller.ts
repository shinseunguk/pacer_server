import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { JobCategoryTree, JobsService } from './jobs.service';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  /** 명세상 인증은 선택 — 온보딩 전에도 직무를 둘러볼 수 있도록 공개한다. */
  @Public()
  @Get('categories')
  @ApiOperation({ summary: '직무 대분류 + 세부 트리 조회' })
  getCategories(): Promise<JobCategoryTree[]> {
    return this.jobsService.getCategoryTree();
  }
}
