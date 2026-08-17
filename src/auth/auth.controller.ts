import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AppException } from '../common/exceptions/app.exception';
import { AuthService, LoginResult } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import {
  SOCIAL_PROVIDERS,
  SocialProvider,
} from './social/social-verifier.interface';
import { AuthUser } from './strategies/jwt.strategy';
import { TokenPair } from './token.service';

/**
 * 인증 경로는 크리덴셜 스터핑 대상이라 전역 상한보다 더 조인다.
 * 데코레이터는 import 시점에 평가되므로 ConfigService 대신 env를 직접 읽는다.
 */
const AUTH_WINDOW_MS = 60_000;
const AUTH_THROTTLE = {
  default: {
    limit: Number(process.env.THROTTLE_AUTH_LIMIT ?? 10),
    ttl: AUTH_WINDOW_MS,
  },
};

@ApiTags('auth')
@Throttle(AUTH_THROTTLE)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login/:provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '소셜 로그인/가입 (카카오·애플)' })
  @ApiParam({ name: 'provider', enum: SOCIAL_PROVIDERS })
  login(
    @Param('provider') provider: string,
    @Body() dto: LoginDto,
  ): Promise<LoginResult> {
    return this.authService.login(
      this.parseProvider(provider),
      dto.idToken,
      dto.nonce,
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '토큰 재발급 (회전)' })
  refresh(@Body() dto: RefreshDto): Promise<TokenPair> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: '로그아웃 (refresh 무효화)' })
  logout(@CurrentUser() user: AuthUser): Promise<void> {
    return this.authService.logout(user.userId);
  }

  private parseProvider(provider: string): SocialProvider {
    if (!SOCIAL_PROVIDERS.includes(provider as SocialProvider)) {
      throw new AppException(
        'BAD_REQUEST',
        '지원하지 않는 로그인 방식이에요.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return provider as SocialProvider;
  }
}
