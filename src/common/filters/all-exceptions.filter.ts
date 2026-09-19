import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { BusinessException } from '../exceptions/business.exception.js';
import {
  ErrorCode,
  ErrorCodeType,
  ErrorMessages,
} from '../constants/error-codes.js';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCodeType = ErrorCode.INTERNAL_SERVER_ERROR;
    let message: string = ErrorMessages[ErrorCode.INTERNAL_SERVER_ERROR];
    let errorName = 'InternalServerError';

    if (exception instanceof BusinessException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      errorName = HttpStatus[status] ?? 'BusinessError';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      errorName = HttpStatus[status] ?? 'HttpException';
      const res = exception.getResponse();

      if (status === HttpStatus.BAD_REQUEST) {
        code = ErrorCode.VALIDATION_FAILED;
        if (res && typeof res === 'object' && 'message' in res) {
          const validationMsg = res.message;
          if (Array.isArray(validationMsg)) {
            message = validationMsg.join('; ');
          } else if (typeof validationMsg === 'string') {
            message = validationMsg;
          } else {
            message = ErrorMessages[ErrorCode.VALIDATION_FAILED];
          }
        } else {
          message = ErrorMessages[ErrorCode.VALIDATION_FAILED];
        }
      } else if (status === HttpStatus.UNAUTHORIZED) {
        code = ErrorCode.TOKEN_INVALID;
        if (typeof res === 'string') {
          message = res;
        } else if (res && typeof res === 'object' && 'message' in res) {
          const msg = res.message;
          message =
            typeof msg === 'string'
              ? msg
              : ErrorMessages[ErrorCode.TOKEN_INVALID];
        } else {
          message = ErrorMessages[ErrorCode.TOKEN_INVALID];
        }
      } else if (status === HttpStatus.CONFLICT) {
        code = ErrorCode.USER_ALREADY_EXISTS;
        message = ErrorMessages[ErrorCode.USER_ALREADY_EXISTS];
      } else {
        if (typeof res === 'string') {
          message = res;
        } else if (res && typeof res === 'object' && 'message' in res) {
          const msg = res.message;
          message = typeof msg === 'string' ? msg : exception.message;
        } else {
          message = exception.message;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error('Unhandled exception:', exception.stack);
      message =
        exception.message || ErrorMessages[ErrorCode.INTERNAL_SERVER_ERROR];
    }

    response.status(status).json({
      code,
      message,
      error: errorName,
      timestamp: Date.now(),
    });
  }
}
