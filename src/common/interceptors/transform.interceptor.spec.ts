import { describe, it, expect, vi } from 'vitest';
import { of } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import {
  ExecutionContext,
  CallHandler,
  HttpStatus,
  BadRequestException,
  ArgumentsHost,
} from '@nestjs/common';
import { TransformInterceptor } from './transform.interceptor.js';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter.js';
import { BusinessException } from '../exceptions/business.exception.js';
import { ErrorCode } from '../constants/error-codes.js';
import { validateEnv } from '../../config/env.validation.js';

describe('Ticket 01: Infrastructure & Response Pipeline', () => {
  describe('validateEnv', () => {
    it('should validate valid environment variables and set defaults', () => {
      const config = validateEnv({
        PORT: '4000',
        JWT_ACCESS_SECRET: 'a-very-long-secret-key-at-least-32-chars!',
        JWT_REFRESH_SECRET: 'another-very-long-secret-key-at-least-32-chars!',
      });
      expect(config.PORT).toBe(4000);
      expect(config.NODE_ENV).toBe('development');
      expect(config.DATABASE_HOST).toBe('localhost');
      expect(config.REDIS_PORT).toBe(6379);
    });

    it('should throw error when secret is too short', () => {
      expect(() =>
        validateEnv({
          JWT_ACCESS_SECRET: 'short',
        }),
      ).toThrow();
    });

    it('should fail fast in development when critical secret is missing', () => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'development',
          PORT: '3000',
        }),
      ).toThrow();
    });

    it('should provide test defaults when NODE_ENV is test', () => {
      const config = validateEnv({
        NODE_ENV: 'test',
        PORT: '3000',
      });
      expect(config.JWT_ACCESS_SECRET).toBeDefined();
      expect(config.JWT_REFRESH_SECRET).toBeDefined();
    });
  });

  describe('TransformInterceptor', () => {
    it('should wrap regular response data into standard envelope', async () => {
      const interceptor = new TransformInterceptor();
      const mockExecutionContext = {} as ExecutionContext;
      const mockCallHandler: CallHandler = {
        handle: () => of({ username: 'alice' }),
      };

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toMatchObject({
        code: ErrorCode.SUCCESS,
        message: 'success',
        data: { username: 'alice' },
      });
      expect(typeof result.timestamp).toBe('number');
    });

    it('should not double-wrap if already enveloped', async () => {
      const interceptor = new TransformInterceptor();
      const mockExecutionContext = {} as ExecutionContext;
      const alreadyWrapped = {
        code: 0,
        message: 'success',
        data: { test: true },
        timestamp: 123456789,
      };
      const mockCallHandler: CallHandler = {
        handle: () => of(alreadyWrapped),
      };

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toEqual(alreadyWrapped);
    });
  });

  describe('AllExceptionsFilter', () => {
    it('should format BusinessException correctly', () => {
      const filter = new AllExceptionsFilter();
      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const hostMock = {
        switchToHttp: () => ({
          getResponse: () => ({ status: statusMock }),
        }),
      } as unknown as ArgumentsHost;

      const businessException = new BusinessException(
        ErrorCode.USER_ALREADY_EXISTS,
        '用户名已存在',
        HttpStatus.CONFLICT,
      );

      filter.catch(businessException, hostMock);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: ErrorCode.USER_ALREADY_EXISTS,
          message: '用户名已存在',
          error: 'CONFLICT',
        }),
      );
    });

    it('should format BadRequestException (Validation error) correctly', () => {
      const filter = new AllExceptionsFilter();
      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const hostMock = {
        switchToHttp: () => ({
          getResponse: () => ({ status: statusMock }),
        }),
      } as unknown as ArgumentsHost;

      const badRequest = new BadRequestException([
        'username must be longer than 3 characters',
      ]);

      filter.catch(badRequest, hostMock);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'username must be longer than 3 characters',
          error: 'BAD_REQUEST',
        }),
      );
    });
  });
});
