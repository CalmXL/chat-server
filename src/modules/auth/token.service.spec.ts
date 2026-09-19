import { describe, it, expect, beforeEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenService } from './token.service.js';
import { DeviceType } from '../../common/enums/index.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { ErrorCode } from '../../common/constants/error-codes.js';

describe('TokenService', () => {
  let tokenService: TokenService;
  let jwtService: JwtService;
  let configService: ConfigService;

  beforeEach(() => {
    jwtService = new JwtService({});
    configService = new ConfigService({
      jwt: {
        accessSecret: 'access-secret-key-at-least-32-chars-long!',
        accessExpiresIn: '15m',
        refreshSecret: 'refresh-secret-key-at-least-32-chars-long!',
        refreshExpiresIn: '7d',
      },
    });

    tokenService = new TokenService(jwtService, configService);
  });

  it('should generate valid token pair with correct payload', async () => {
    const tokens = await tokenService.generateTokenPair({
      userId: 'user-uuid-1234',
      username: 'alice',
      deviceType: DeviceType.WEB,
      deviceId: 'device-web-1',
    });

    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
    expect(tokens.expiresIn).toBe(900);
    expect(tokens.accessTokenJti).toBeDefined();
    expect(tokens.refreshTokenJti).toBeDefined();

    const accessPayload = await tokenService.verifyAccessToken(tokens.accessToken);
    expect(accessPayload.sub).toBe('user-uuid-1234');
    expect(accessPayload.username).toBe('alice');
    expect(accessPayload.deviceType).toBe(DeviceType.WEB);
    expect(accessPayload.deviceId).toBe('device-web-1');
    expect(accessPayload.jti).toBe(tokens.accessTokenJti);

    const refreshPayload = await tokenService.verifyRefreshToken(tokens.refreshToken);
    expect(refreshPayload.sub).toBe('user-uuid-1234');
    expect(refreshPayload.deviceType).toBe(DeviceType.WEB);
    expect(refreshPayload.deviceId).toBe('device-web-1');
    expect(refreshPayload.jti).toBe(tokens.refreshTokenJti);
  });

  it('should throw TOKEN_INVALID on tampered token', async () => {
    await expect(
      tokenService.verifyAccessToken('invalid.jwt.token'),
    ).rejects.toThrowError(BusinessException);

    try {
      await tokenService.verifyAccessToken('invalid.jwt.token');
    } catch (err: unknown) {
      const bErr = err as BusinessException;
      expect(bErr.code).toBe(ErrorCode.TOKEN_INVALID);
    }
  });
});
