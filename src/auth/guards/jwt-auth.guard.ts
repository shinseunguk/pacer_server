import { ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { AppException } from '../../common/exceptions/app.exception';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/** jsonwebtoken이 만료 토큰에 붙이는 에러 이름. */
const TOKEN_EXPIRED = 'TokenExpiredError';

/** 전역 인증 가드. @Public() 이 붙은 핸들러/컨트롤러는 통과시킨다. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  /**
   * passport의 기본 실패 처리는 영문 "Unauthorized"를 그대로 사용자에게 내보낸다.
   * 앱이 `error.message`를 화면에 띄우므로 한국어로 바꾼다.
   *
   * `code`는 UNAUTHORIZED로 유지한다 — 앱은 코드를 보고 토큰 재발급을 시도한다.
   */
  handleRequest<TUser>(err: unknown, user: TUser, info: unknown): TUser {
    if (err || !user) {
      throw new AppException(
        'UNAUTHORIZED',
        messageFor(info),
        HttpStatus.UNAUTHORIZED,
      );
    }
    return user;
  }
}

/** 만료와 그 외(누락·위조)를 구분한다 — 사용자가 할 일이 다르다. */
function messageFor(info: unknown): string {
  if (info instanceof Error && info.name === TOKEN_EXPIRED) {
    return '로그인이 만료되었어요. 다시 로그인해주세요.';
  }
  return '로그인이 필요해요.';
}
