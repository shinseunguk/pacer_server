import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import * as Sentry from '@sentry/nestjs';
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

/**
 * 상태코드별 한국어 기본 메시지.
 *
 * Nest 기본 예외(`UnauthorizedException` 등)와 ValidationPipe는 영문 메시지를 낸다.
 * 앱은 `error.message`를 그대로 화면에 띄우므로 사용자에게 영어가 보인다.
 * 도메인 예외는 `AppException`으로 한국어를 싣고, 그 외는 여기서 막는다.
 */
const KOREAN_MESSAGES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: '입력값을 확인해주세요.',
  [HttpStatus.UNAUTHORIZED]: '로그인이 필요해요.',
  [HttpStatus.PAYMENT_REQUIRED]: '이용권이 필요해요.',
  [HttpStatus.FORBIDDEN]: '권한이 없어요.',
  [HttpStatus.NOT_FOUND]: '요청하신 정보를 찾을 수 없어요.',
  [HttpStatus.CONFLICT]: '이미 처리된 요청이에요.',
  [HttpStatus.UNPROCESSABLE_ENTITY]: '요청을 처리할 수 없어요.',
  [HttpStatus.TOO_MANY_REQUESTS]:
    '요청이 너무 잦아요. 잠시 후 다시 시도해주세요.',
  [HttpStatus.SERVICE_UNAVAILABLE]: '잠시 후 다시 시도해주세요.',
};

const FALLBACK_MESSAGE = '요청을 처리하지 못했어요.';

const HANGUL = /[가-힣]/;

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
      // 4xx는 클라이언트 잘못이라 알림 노이즈만 된다 — 5xx만 올린다.
      // DSN이 없으면 SDK가 초기화되지 않아 이 호출은 no-op이다.
      Sentry.captureException(exception);
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
            message: this.toKorean(status, this.extractMessage(exception)),
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

  /**
   * 한국어가 없는 메시지는 사용자에게 내보내지 않는다.
   *
   * "Unauthorized", "questionCount must not be less than 5" 같은 문자열이 그대로
   * 화면에 뜨는 걸 막는다. 원문은 디버깅을 위해 로그로만 남긴다 — 검증 메시지에는
   * 필드명·제약값만 담기고 사용자가 입력한 값은 들어가지 않는다.
   */
  private toKorean(status: number, message: string): string {
    if (HANGUL.test(message)) return message;

    this.logger.debug(`영문 메시지를 한국어로 대체 (${status}): ${message}`);
    return KOREAN_MESSAGES[status] ?? FALLBACK_MESSAGE;
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
