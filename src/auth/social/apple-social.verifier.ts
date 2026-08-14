import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/exceptions/app.exception';
import { SocialProfile, SocialVerifier } from './social-verifier.interface';

/**
 * 애플 identity token(JWT) 검증기.
 *
 * TODO(키 확보 시): Apple JWKS(https://appleid.apple.com/auth/keys)로 서명 검증 +
 * aud(APPLE_CLIENT_ID)·iss·nonce 검증 후 sub/email 추출. 지금은 키가 없으므로
 * 미구성 상태로 두고 dev에서는 MockSocialVerifier를 사용한다.
 */
@Injectable()
export class AppleSocialVerifier implements SocialVerifier {
  constructor(private readonly config: ConfigService) {}

  verify(_idToken: string, _nonce?: string): Promise<SocialProfile> {
    const clientId = this.config.get<string>('APPLE_CLIENT_ID');
    if (!clientId) {
      throw new AppException(
        'APPLE_NOT_CONFIGURED',
        '애플 로그인이 아직 설정되지 않았어요.',
        HttpStatus.NOT_IMPLEMENTED,
      );
    }

    // 실제 JWKS 서명 검증은 키 확보 후 구현 예정.
    throw new AppException(
      'APPLE_NOT_CONFIGURED',
      '애플 로그인 서명 검증이 아직 구현되지 않았어요.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
