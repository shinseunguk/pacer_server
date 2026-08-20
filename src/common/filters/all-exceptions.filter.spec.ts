import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
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

  it('Nest 기본 예외의 영문 메시지를 한국어로 바꾼다', () => {
    // 앱은 error.message를 그대로 화면에 띄운다 — "Unauthorized"가 나가면 안 된다.
    const captured = {} as Captured;
    filter.catch(new UnauthorizedException(), createHost(captured));

    expect(captured.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: '로그인이 필요해요.' },
    });
  });

  it('ValidationPipe의 영문 메시지도 막는다', () => {
    // 가드뿐 아니라 파이프도 같은 위험이 있다.
    const captured = {} as Captured;
    filter.catch(
      new BadRequestException(['questionCount must not be less than 5']),
      createHost(captured),
    );

    expect(captured.body).toEqual({
      error: { code: 'BAD_REQUEST', message: '입력값을 확인해주세요.' },
    });
  });

  it('한국어가 섞인 메시지는 그대로 둔다', () => {
    const captured = {} as Captured;
    filter.catch(
      new BadRequestException('질문 수는 5개 이상이어야 해요.'),
      createHost(captured),
    );

    expect(captured.body).toEqual({
      error: { code: 'BAD_REQUEST', message: '질문 수는 5개 이상이어야 해요.' },
    });
  });

  it('한국어 기본 메시지가 없는 상태코드는 범용 문구로 떨어진다', () => {
    const captured = {} as Captured;
    filter.catch(new NotFoundException(), createHost(captured));

    expect(
      (captured.body as { error: { message: string } }).error.message,
    ).toBe('요청하신 정보를 찾을 수 없어요.');
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
