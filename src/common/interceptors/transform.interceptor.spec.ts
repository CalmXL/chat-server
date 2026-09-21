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
import { Reflector } from '@nestjs/core';
import { BYPASS_TRANSFORM_KEY } from '../decorators/bypass-transform.decorator.js';
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
        AI_PROVIDERS_JSON: JSON.stringify([
          {
            id: 'openai',
            baseURL: 'https://api.openai.com/v1',
            apiKey: 'sk-test-key-1234',
            models: [{ id: 'gpt-4o', label: 'GPT-4o' }],
          },
        ]),
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
      expect(config.AI_PROVIDERS).toBeDefined();
      expect(config.AI_PROVIDERS.length).toBeGreaterThan(0);
    });

    it('should fail fast in development when AI_PROVIDERS_JSON is missing', () => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'development',
          JWT_ACCESS_SECRET: 'a-very-long-secret-key-at-least-32-chars!',
          JWT_REFRESH_SECRET: 'another-very-long-secret-key-at-least-32-chars!',
        }),
      ).toThrow();
    });

    it('should validate valid AI_PROVIDERS_JSON in development', () => {
      const config = validateEnv({
        NODE_ENV: 'development',
        JWT_ACCESS_SECRET: 'a-very-long-secret-key-at-least-32-chars!',
        JWT_REFRESH_SECRET: 'another-very-long-secret-key-at-least-32-chars!',
        AI_PROVIDERS_JSON: JSON.stringify([
          {
            id: 'deepseek',
            baseURL: 'https://api.deepseek.com/v1',
            apiKey: 'sk-deepseek-key-1234',
            models: [{ id: 'deepseek-chat', label: 'DeepSeek Chat' }],
          },
        ]),
      });
      expect(config.AI_PROVIDERS).toHaveLength(1);
      expect(config.AI_PROVIDERS[0].id).toBe('deepseek');
    });

    it('should fail fast if AI_PROVIDERS_JSON is invalid JSON or invalid schema', () => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'development',
          JWT_ACCESS_SECRET: 'a-very-long-secret-key-at-least-32-chars!',
          JWT_REFRESH_SECRET: 'another-very-long-secret-key-at-least-32-chars!',
          AI_PROVIDERS_JSON: 'invalid-json-string',
        }),
      ).toThrow();

      expect(() =>
        validateEnv({
          NODE_ENV: 'development',
          JWT_ACCESS_SECRET: 'a-very-long-secret-key-at-least-32-chars!',
          JWT_REFRESH_SECRET: 'another-very-long-secret-key-at-least-32-chars!',
          AI_PROVIDERS_JSON: JSON.stringify([
            {
              id: 'deepseek',
              baseURL: 'not-a-url',
              apiKey: 'sk-key',
              models: [],
            },
          ]),
        }),
      ).toThrow();
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

    it('should bypass transformation when route is marked with @BypassTransform()', async () => {
      const reflector = new Reflector();
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
      const interceptor = new TransformInterceptor(reflector);

      const mockExecutionContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
      } as unknown as ExecutionContext;

      const rawData = { streamChunk: 'chunk_1' };
      const mockCallHandler: CallHandler = {
        handle: () => of(rawData),
      };

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toBe(rawData);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
        BYPASS_TRANSFORM_KEY,
        expect.any(Array),
      );
    });

    it('should wrap response when Reflector is provided but route is not marked with bypass', async () => {
      const reflector = new Reflector();
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const interceptor = new TransformInterceptor(reflector);

      const mockExecutionContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
      } as unknown as ExecutionContext;

      const mockCallHandler: CallHandler = {
        handle: () => of({ key: 'val' }),
      };

      const result = await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(result).toMatchObject({
        code: ErrorCode.SUCCESS,
        message: 'success',
        data: { key: 'val' },
      });
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
