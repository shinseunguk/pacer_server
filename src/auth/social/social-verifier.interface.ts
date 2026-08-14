export type SocialProvider = 'kakao' | 'apple' | 'google';

export const SOCIAL_PROVIDERS: SocialProvider[] = ['kakao', 'apple', 'google'];

/** 소셜 공급자 검증 결과(정규화된 프로필). */
export interface SocialProfile {
  provider: SocialProvider;
  socialId: string;
  email?: string | null;
  /** 애플 최초 로그인 등에서만 전달될 수 있음 */
  name?: string | null;
}

/** 각 소셜 공급자 토큰을 검증해 프로필로 변환한다. */
export interface SocialVerifier {
  verify(idToken: string, nonce?: string): Promise<SocialProfile>;
}
