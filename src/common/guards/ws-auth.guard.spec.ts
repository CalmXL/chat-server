import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { WsAuthGuard, WsSocketLike } from './ws-auth.guard.js';
import { TokenService } from '../../modules/auth/token.service.js';
import { SessionService } from '../../modules/auth/session.service.js';
import { DeviceType } from '../enums/index.js';

describe('WsAuthGuard', () => {
  let guard: WsAuthGuard;
  let tokenService: TokenService;
  let sessionService: SessionService;

  beforeEach(() => {
    tokenService = {
      verifyAccessToken: vi.fn(),
    } as unknown as TokenService;

    sessionService = {
      isTokenBlacklisted: vi.fn(),
    } as unknown as SessionService;

    guard = new WsAuthGuard(tokenService, sessionService);
  });

  it('should authenticate client with token in handshake auth', async () => {
    const client: WsSocketLike = {
      handshake: {
        auth: { token: 'valid-ws-token' },
      },
      data: {},
    };

    const context = {
      switchToWs: () => ({
        getClient: () => client,
      }),
    } as unknown as ExecutionContext;

    const payload = {
      sub: 'user-uuid-1',
      username: 'alice',
      deviceType: DeviceType.WEB,
      deviceId: 'web-1',
      jti: 'ws-jti-1',
    };

    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(payload);
    vi.mocked(sessionService.isTokenBlacklisted).mockResolvedValue(false);

    const canActivate = await guard.canActivate(context);
    expect(canActivate).toBe(true);
    expect(client.data.user).toEqual(payload);
  });

  it('should reject client when token is blacklisted', async () => {
    const client: WsSocketLike = {
      handshake: {
        auth: { token: 'blacklisted-token' },
      },
      data: {},
    };

    const context = {
      switchToWs: () => ({
        getClient: () => client,
      }),
    } as unknown as ExecutionContext;

    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue({
      sub: 'user-uuid-1',
      username: 'alice',
      deviceType: DeviceType.WEB,
      deviceId: 'web-1',
      jti: 'ws-jti-blacklisted',
    });
    vi.mocked(sessionService.isTokenBlacklisted).mockResolvedValue(true);

    const canActivate = await guard.canActivate(context);
    expect(canActivate).toBe(false);
  });
});
