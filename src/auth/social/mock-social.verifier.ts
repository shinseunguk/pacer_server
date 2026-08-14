import { Injectable } from '@nestjs/common';
import { SocialProfile, SocialProvider } from './social-verifier.interface';

/**
 * 개발/테스트용 소셜 검증기. 실제 공급자 키가 없을 때 사용한다.
 *
 * idToken 규약(테스트 편의): `socialId` 또는 `socialId|email|name`(파이프 구분).
 * 예) "u123" / "u123|me@test.com|승욱"
 */
@Injectable()
export class MockSocialVerifier {
  verify(provider: SocialProvider, idToken: string): Promise<SocialProfile> {
    const [socialId, email, name] = idToken.split('|');
    return Promise.resolve({
      provider,
      socialId: socialId || idToken,
      email: email || null,
      name: name || null,
    });
  }
}
