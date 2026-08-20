import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { AdminTokenGuard, ADMIN_TOKEN_HEADER } from './admin-token.guard';
import { AdminService, DashboardMetrics } from './admin.service';
import { DEFAULT_PERIOD_DAYS, MetricsQueryDto } from './dto/metrics-query.dto';
import { DASHBOARD_HTML } from './dashboard-page';

const DAY_MS = 24 * 60 * 60 * 1000;

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /**
   * 대시보드 껍데기. **데이터가 들어 있지 않다** — 토큰은 브라우저가 보관하고
   * 지표는 아래 API에서 따로 받아온다. 그래서 이 페이지 자체는 공개해도 안전하다.
   */
  @Public()
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiExcludeEndpoint()
  dashboard(): string {
    return DASHBOARD_HTML;
  }

  @UseGuards(AdminTokenGuard)
  @Public()
  @ApiHeader({ name: ADMIN_TOKEN_HEADER, required: true })
  @Get('metrics')
  metrics(@Query() query: MetricsQueryDto): Promise<DashboardMetrics> {
    const days = query.days ?? DEFAULT_PERIOD_DAYS;
    const to = new Date();
    const from = new Date(to.getTime() - days * DAY_MS);

    return this.admin.metrics({ from, to });
  }
}
