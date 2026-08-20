import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';

export const ADMIN_TOKEN_HEADER = 'x-admin-token';

/**
 * 운영 대시보드 전용 가드.
 *
 * 일반 사용자 JWT로는 통과할 수 없다 — 운영 지표는 사용자 권한과 전혀 다른 축이고,
 * 사용자 테이블에 관리자 플래그를 두면 탈취 하나로 지표까지 열린다.
 *
 * `ADMIN_API_TOKEN`이 비어 있으면 **모든 요청을 막는다.** 설정을 깜빡했을 때
 * 열린 채로 도는 것보다 닫힌 채로 도는 편이 안전하다.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('ADMIN_API_TOKEN');
    if (!expected) {
      throw new UnauthorizedException('관리자 토큰이 설정되지 않았습니다.');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header(ADMIN_TOKEN_HEADER);
    if (!provided || !matches(provided, expected)) {
      throw new UnauthorizedException('관리자 토큰이 올바르지 않습니다.');
    }

    return true;
  }
}

/** 길이 차이로 정답을 좁히지 못하도록 상수 시간 비교를 쓴다. */
function matches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
