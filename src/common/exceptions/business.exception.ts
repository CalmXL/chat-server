import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodeType, ErrorMessages } from '../constants/error-codes.js';

export class BusinessException extends HttpException {
  public readonly code: ErrorCodeType;

  constructor(
    code: ErrorCodeType,
    message?: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    const finalMessage = message ?? ErrorMessages[code] ?? 'Business Error';
    super(
      {
        code,
        message: finalMessage,
        error: HttpStatus[status],
        timestamp: Date.now(),
      },
      status,
    );
    this.code = code;
  }
}
