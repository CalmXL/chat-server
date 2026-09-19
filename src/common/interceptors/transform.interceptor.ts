import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface.js';
import { ErrorCode } from '../constants/error-codes.js';

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data: unknown) => {
        // If the handler already returned an ApiResponse envelope, avoid double wrapping
        if (
          data !== null &&
          typeof data === 'object' &&
          'code' in data &&
          'message' in data &&
          'timestamp' in data
        ) {
          return data as unknown as ApiResponse<T>;
        }

        return {
          code: ErrorCode.SUCCESS,
          message: 'success',
          data: (data !== undefined ? data : null) as T,
          timestamp: Date.now(),
        };
      }),
    );
  }
}
