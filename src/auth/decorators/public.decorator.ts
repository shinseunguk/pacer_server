import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 전역 JwtAuthGuard를 우회(비인증 허용)하는 엔드포인트 표시. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
