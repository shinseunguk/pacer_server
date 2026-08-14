import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';
import { HttpStatus } from '@nestjs/common';
import { SocialProfile, SocialVerifier } from './social-verifier.interface';

interface KakaoUserResponse {
  id: number;
  kakao_account?: {
    email?: string;
    profile?: { nickname?: string };
  };
}

/** 카카오 액세스 토큰으로 사용자 정보를 조회해 검증한다. */
@Injectable()
export class KakaoSocialVerifier implements SocialVerifier {
  private static readonly USER_ME = 'https://kapi.kakao.com/v2/user/me';

  async verify(idToken: string): Promise<SocialProfile> {
    const response = await fetch(KakaoSocialVerifier.USER_ME, {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!response.ok) {
      throw new AppException(
        'UNAUTHORIZED',
        '카카오 인증에 실패했어요.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const data = (await response.json()) as KakaoUserResponse;
    return {
      provider: 'kakao',
      socialId: String(data.id),
      email: data.kakao_account?.email ?? null,
      name: data.kakao_account?.profile?.nickname ?? null,
    };
  }
}
