import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAgreement } from '../users/entities/user-agreement.entity';
import { User } from '../users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenStore } from './refresh-token.store';
import { AppleSocialVerifier } from './social/apple-social.verifier';
import { KakaoSocialVerifier } from './social/kakao-social.verifier';
import { MockSocialVerifier } from './social/mock-social.verifier';
import { SocialVerifierService } from './social/social-verifier.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([User, UserAgreement]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    RefreshTokenStore,
    JwtStrategy,
    SocialVerifierService,
    KakaoSocialVerifier,
    AppleSocialVerifier,
    MockSocialVerifier,
  ],
})
export class AuthModule {}
