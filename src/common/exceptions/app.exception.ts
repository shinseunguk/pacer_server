import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 코드가 있는 도메인 예외.
 * API 명세의 에러 포맷 `{ error: { code, message } }`에서 `code`를 명시적으로 지정할 때 사용한다.
 */
export class AppException extends HttpException {
  readonly code: string;

  constructor(code: string, message: string, status: HttpStatus) {
    super(message, status);
    this.code = code;
  }
}
