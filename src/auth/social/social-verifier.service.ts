import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/exceptions/app.exception';
import { AppleSocialVerifier } from './apple-social.verifier';
import { KakaoSocialVerifier } from './kakao-social.verifier';
import { MockSocialVerifier } from './mock-social.verifier';
import { SocialProfile, SocialProvider } from './social-verifier.interface';

/**
 * 공급자별 검증기를 선택한다.
 * - 개발·테스트(NODE_ENV != production)에서 해당 공급자 키가 없으면 MockSocialVerifier 사용.
 * - 운영에서는 실제 검증기만 사용.
 */
@Injectable()
export class SocialVerifierService {
  constructor(
    private readonly config: ConfigService,
    private readonly kakao: KakaoSocialVerifier,
    private readonly apple: AppleSocialVerifier,
    private readonly mock: MockSocialVerifier,
  ) {}

  verify(
    provider: SocialProvider,
    idToken: string,
    nonce?: string,
  ): Promise<SocialProfile> {
    if (this.shouldUseMock(provider)) {
      return this.mock.verify(provider, idToken);
    }

    switch (provider) {
      case 'kakao':
        return this.kakao.verify(idToken);
      case 'apple':
        return this.apple.verify(idToken, nonce);
      case 'google':
        // 구글 로그인은 P1 (Phase A 범위 밖).
        throw new AppException(
          'PROVIDER_NOT_SUPPORTED',
          '지원하지 않는 로그인 방식이에요.',
          HttpStatus.BAD_REQUEST,
        );
    }
  }

  private shouldUseMock(provider: SocialProvider): boolean {
    if (this.config.get<string>('NODE_ENV') === 'production') return false;
    return !this.hasCredentials(provider);
  }

  private hasCredentials(provider: SocialProvider): boolean {
    switch (provider) {
      case 'kakao':
        return !!this.config.get<string>('KAKAO_REST_API_KEY');
      case 'apple':
        return !!this.config.get<string>('APPLE_CLIENT_ID');
      case 'google':
        return false;
    }
  }
}
