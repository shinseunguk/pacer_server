import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { OnboardingDto } from './dto/onboarding.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserProfile, UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('onboarding')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '최초 온보딩 (닉네임 + 필수 동의)' })
  onboarding(
    @CurrentUser() user: AuthUser,
    @Body() dto: OnboardingDto,
  ): Promise<{ onboardingCompleted: true }> {
    return this.usersService.completeOnboarding(
      user.userId,
      dto.nickname,
      dto.agreements,
    );
  }

  @Get('me')
  @ApiOperation({ summary: '내 프로필 조회 (오늘 사용량 포함)' })
  getMe(@CurrentUser() user: AuthUser): Promise<UserProfile> {
    return this.usersService.getProfile(user.userId);
  }

  @Patch('me')
  @ApiOperation({ summary: '닉네임 수정' })
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateUserDto,
  ): Promise<UserProfile> {
    return this.usersService.updateNickname(user.userId, dto.nickname);
  }

  @Delete('me')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '회원 탈퇴 (파기 예약)' })
  withdraw(@CurrentUser() user: AuthUser): Promise<void> {
    return this.usersService.withdraw(user.userId);
  }
}
