import { ArgumentsHost, HttpStatus, NotFoundException } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception';
import { AllExceptionsFilter } from './all-exceptions.filter';

interface Captured {
  status: number;
  body: unknown;
}

function createHost(captured: Captured): ArgumentsHost {
  const response = {
    status(code: number) {
      captured.status = code;
      return response;
    },
    json(body: unknown) {
      captured.body = body;
      return response;
    },
  };

  return {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('AppException은 지정한 code·status를 그대로 반환한다', () => {
    const captured = {} as Captured;
    filter.catch(
      new AppException(
        'QUOTA_EXCEEDED',
        '무료 한도를 모두 사용했어요.',
        HttpStatus.PAYMENT_REQUIRED,
      ),
      createHost(captured),
    );

    expect(captured.status).toBe(HttpStatus.PAYMENT_REQUIRED);
    expect(captured.body).toEqual({
      error: {
        code: 'QUOTA_EXCEEDED',
        message: '무료 한도를 모두 사용했어요.',
      },
    });
  });

  it('일반 HttpException은 상태코드에 맞는 code로 매핑한다', () => {
    const captured = {} as Captured;
    filter.catch(new NotFoundException('없어요'), createHost(captured));

    expect(captured.status).toBe(HttpStatus.NOT_FOUND);
    expect(captured.body).toEqual({
      error: { code: 'NOT_FOUND', message: '없어요' },
    });
  });

  it('알 수 없는 예외는 500 INTERNAL_ERROR로 처리한다', () => {
    const captured = {} as Captured;
    filter.catch(new Error('boom'), createHost(captured));

    expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했어요.' },
    });
  });
});
