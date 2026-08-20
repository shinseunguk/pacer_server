import { Reflector } from '@nestjs/core';
import { AppException } from '../../common/exceptions/app.exception';
import { JwtAuthGuard } from './jwt-auth.guard';

function guard(): JwtAuthGuard {
  return new JwtAuthGuard(new Reflector());
}

/** jsonwebtoken이 만료 시 넘기는 에러를 흉내낸다. */
function expiredError(): Error {
  const error = new Error('jwt expired');
  error.name = 'TokenExpiredError';
  return error;
}

describe('JwtAuthGuard.handleRequest', () => {
  it('인증에 성공하면 사용자를 그대로 돌려준다', () => {
    const user = { id: 'user-1' };

    expect(guard().handleRequest(null, user, null)).toBe(user);
  });

  it('토큰이 없거나 위조면 한국어로 막는다', () => {
    // 앱이 error.message를 그대로 화면에 띄우므로 영문이 나가면 안 된다.
    expect(() => guard().handleRequest(null, null, null)).toThrow(
      '로그인이 필요해요.',
    );
  });

  it('만료는 다른 메시지를 준다 — 사용자가 할 일이 다르다', () => {
    expect(() => guard().handleRequest(null, null, expiredError())).toThrow(
      '로그인이 만료되었어요. 다시 로그인해주세요.',
    );
  });

  it('코드는 UNAUTHORIZED로 유지한다 — 앱의 토큰 재발급 흐름이 이걸 본다', () => {
    try {
      guard().handleRequest(null, null, expiredError());
      fail('예외가 발생해야 한다');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe('UNAUTHORIZED');
      expect((error as AppException).getStatus()).toBe(401);
    }
  });

  it('전략이 에러를 던져도 한국어로 정규화한다', () => {
    expect(() => guard().handleRequest(new Error('boom'), null, null)).toThrow(
      AppException,
    );
  });
});
