import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { AppException } from '../exceptions/app.exception';

/** HTTP 상태코드 → 기본 에러 코드 매핑 (AppException이 아닌 경우) */
const STATUS_CODE_MAP: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.PAYMENT_REQUIRED]: 'PAYMENT_REQUIRED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
};

/** 5xx 판정 기준 (enum 비교를 피하려 숫자 상수로 둔다). */
const SERVER_ERROR_STATUS = 500;

interface ErrorBody {
  error: { code: string; message: string };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toErrorResponse(exception);

    if (status >= SERVER_ERROR_STATUS) {
      this.logger.error(
        `${body.error.code}: ${body.error.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(body);
  }

  private toErrorResponse(exception: unknown): {
    status: number;
    body: ErrorBody;
  } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        body: { error: { code: exception.code, message: exception.message } },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        body: {
          error: {
            code: STATUS_CODE_MAP[status] ?? 'ERROR',
            message: this.extractMessage(exception),
          },
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했어요.' },
      },
    };
  }

  /** ValidationPipe 등은 message가 배열일 수 있어 첫 항목을 대표 메시지로 사용한다. */
  private extractMessage(exception: HttpException): string {
    const res = exception.getResponse();
    if (typeof res === 'string') return res;

    const message = (res as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message[0];
    return message ?? exception.message;
  }
}
