import { ConfigService } from '@nestjs/config';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';

function contextWith(token?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) =>
          name === 'x-admin-token' ? token : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

function guardWith(expected?: string): AdminTokenGuard {
  const config = { get: () => expected } as unknown as ConfigService;
  return new AdminTokenGuard(config);
}

describe('AdminTokenGuard', () => {
  it('토큰이 일치하면 통과시킨다', () => {
    expect(guardWith('secret').canActivate(contextWith('secret'))).toBe(true);
  });

  it('토큰이 다르면 막는다', () => {
    expect(() => guardWith('secret').canActivate(contextWith('wrong'))).toThrow(
      UnauthorizedException,
    );
  });

  it('토큰이 없으면 막는다', () => {
    expect(() => guardWith('secret').canActivate(contextWith())).toThrow(
      UnauthorizedException,
    );
  });

  it('길이가 다른 토큰도 막는다', () => {
    // 상수 시간 비교는 길이가 같아야 하므로 길이 분기가 필요하다.
    expect(() => guardWith('secret').canActivate(contextWith('s'))).toThrow(
      UnauthorizedException,
    );
  });

  it('ADMIN_API_TOKEN이 비어 있으면 열지 않고 막는다', () => {
    // 설정을 깜빡했을 때 열린 채로 도는 것보다 닫힌 채로 도는 편이 안전하다.
    expect(() => guardWith('').canActivate(contextWith('anything'))).toThrow(
      UnauthorizedException,
    );
    expect(() => guardWith().canActivate(contextWith('anything'))).toThrow(
      UnauthorizedException,
    );
  });
});
