import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard, AuthenticatedRequest } from './jwt-auth.guard.js';
import { TokenService } from '../../modules/auth/token.service.js';
import { SessionService } from '../../modules/auth/session.service.js';
import { BusinessException } from '../exceptions/business.exception.js';
import { ErrorCode } from '../constants/error-codes.js';
import { DeviceType } from '../enums/index.js';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;
  let tokenService: TokenService;
  let sessionService: SessionService;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: vi.fn(),
    } as unknown as Reflector;

    tokenService = {
      verifyAccessToken: vi.fn(),
    } as unknown as TokenService;

    sessionService = {
      isTokenBlacklisted: vi.fn(),
    } as unknown as SessionService;

    guard = new JwtAuthGuard(reflector, tokenService, sessionService);
  });

  const createMockContext = (headers: Record<string, string> = {}): ExecutionContext => {
    const request: Partial<AuthenticatedRequest> = {
      headers,
    };

    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request as AuthenticatedRequest,
      }),
    } as unknown as ExecutionContext;
  };

  it('should allow access for @Public() routes', async () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(true);
    const context = createMockContext();

    const canActivate = await guard.canActivate(context);
    expect(canActivate).toBe(true);
    expect(tokenService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('should throw TOKEN_INVALID when Authorization header is missing', async () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(false);
    const context = createMockContext({});

    await expect(guard.canActivate(context)).rejects.toThrowError(BusinessException);

    try {
      await guard.canActivate(context);
    } catch (err: unknown) {
      const bErr = err as BusinessException;
      expect(bErr.code).toBe(ErrorCode.TOKEN_INVALID);
      expect(bErr.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    }
  });

  it('should throw TOKEN_INVALID when Authorization header is not Bearer', async () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(false);
    const context = createMockContext({ authorization: 'Basic dXNlcjpwYXNz' });

    await expect(guard.canActivate(context)).rejects.toThrowError(BusinessException);
  });

  it('should throw TOKEN_REVOKED when token is blacklisted in Redis', async () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(false);
    const context = createMockContext({ authorization: 'Bearer valid.jwt.token' });

    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue({
      sub: 'user-uuid-1',
      username: 'alice',
      deviceType: DeviceType.WEB,
      deviceId: 'web-1',
      jti: 'blacklisted-jti-123',
    });

    vi.mocked(sessionService.isTokenBlacklisted).mockResolvedValue(true);

    await expect(guard.canActivate(context)).rejects.toThrowError(BusinessException);

    try {
      await guard.canActivate(context);
    } catch (err: unknown) {
      const bErr = err as BusinessException;
      expect(bErr.code).toBe(ErrorCode.TOKEN_REVOKED);
      expect(bErr.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    }
  });

  it('should allow access and attach user payload when token is valid', async () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(false);
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: 'Bearer valid.jwt.token' },
    };
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request as AuthenticatedRequest,
      }),
    } as unknown as ExecutionContext;

    const payload = {
      sub: 'user-uuid-1',
      username: 'alice',
      deviceType: DeviceType.WEB,
      deviceId: 'web-1',
      jti: 'valid-jti-123',
    };

    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(payload);
    vi.mocked(sessionService.isTokenBlacklisted).mockResolvedValue(false);

    const canActivate = await guard.canActivate(context);
    expect(canActivate).toBe(true);
    expect(request.user).toEqual(payload);
    expect(request.rawToken).toBe('valid.jwt.token');
  });
});
