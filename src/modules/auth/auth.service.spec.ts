import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { UserService } from '../user/user.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { SessionService } from './session.service.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { ErrorCode } from '../../common/constants/error-codes.js';
import { DeviceType, UserStatus } from '../../common/enums/index.js';
import { User } from '../user/entities/user.entity.js';

describe('AuthService', () => {
  let authService: AuthService;
  let userService: UserService;
  let passwordService: PasswordService;
  let tokenService: TokenService;
  let sessionService: SessionService;

  const mockUser: User = {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'alice_dev',
    email: 'alice@example.com',
    passwordHash: '$argon2id$mockedhash',
    nickname: 'Alice',
    avatar: 'https://example.com/avatar.png',
    status: UserStatus.ACTIVE,
    createdAt: new Date('2026-09-18T10:00:00.000Z'),
    updatedAt: new Date('2026-09-18T10:00:00.000Z'),
  };

  beforeEach(() => {
    userService = {
      findByUsername: vi.fn(),
      findByEmail: vi.fn(),
      findByIdentifier: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
    } as unknown as UserService;

    passwordService = {
      hashPassword: vi.fn().mockResolvedValue('$argon2id$mockedhash'),
      verifyPassword: vi.fn(),
    } as unknown as PasswordService;

    tokenService = {
      generateTokenPair: vi.fn().mockResolvedValue({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresIn: 900,
        accessTokenJti: 'mock-access-jti',
        refreshTokenJti: 'mock-refresh-jti',
      }),
      verifyAccessToken: vi.fn(),
      verifyRefreshToken: vi.fn(),
    } as unknown as TokenService;

    sessionService = {
      saveSession: vi.fn().mockResolvedValue(undefined),
      getSession: vi.fn().mockResolvedValue(null),
      deleteSession: vi.fn().mockResolvedValue(1),
      isTokenBlacklisted: vi.fn().mockResolvedValue(false),
      blacklistToken: vi.fn().mockResolvedValue(undefined),
    } as unknown as SessionService;

    authService = new AuthService(
      userService,
      passwordService,
      tokenService,
      sessionService,
    );
  });

  describe('register', () => {
    it('should successfully register a new user', async () => {
      vi.mocked(userService.findByUsername).mockResolvedValue(null);
      vi.mocked(userService.findByEmail).mockResolvedValue(null);
      vi.mocked(userService.create).mockResolvedValue(mockUser);

      const result = await authService.register({
        username: 'alice_dev',
        email: 'alice@example.com',
        password: 'Password123',
        nickname: 'Alice',
        avatar: 'https://example.com/avatar.png',
      });

      expect(userService.findByUsername).toHaveBeenCalledWith('alice_dev');
      expect(userService.findByEmail).toHaveBeenCalledWith('alice@example.com');
      expect(passwordService.hashPassword).toHaveBeenCalledWith('Password123');
      expect(result).toMatchObject({
        id: '11111111-1111-1111-1111-111111111111',
        username: 'alice_dev',
        email: 'alice@example.com',
        nickname: 'Alice',
        avatar: 'https://example.com/avatar.png',
        status: UserStatus.ACTIVE,
      });
      expect(
        (result as unknown as Record<string, unknown>).passwordHash,
      ).toBeUndefined();
    });

    it('should throw USER_ALREADY_EXISTS when username is taken', async () => {
      vi.mocked(userService.findByUsername).mockResolvedValue(mockUser);

      await expect(
        authService.register({
          username: 'alice_dev',
          email: 'alice_new@example.com',
          password: 'Password123',
        }),
      ).rejects.toThrowError(BusinessException);
    });

    it('should throw USER_ALREADY_EXISTS when email is taken', async () => {
      vi.mocked(userService.findByUsername).mockResolvedValue(null);
      vi.mocked(userService.findByEmail).mockResolvedValue(mockUser);

      await expect(
        authService.register({
          username: 'alice_new',
          email: 'alice@example.com',
          password: 'Password123',
        }),
      ).rejects.toThrowError(BusinessException);
    });
  });

  describe('login & kickout', () => {
    it('should successfully login with valid username and password', async () => {
      vi.mocked(userService.findByIdentifier).mockResolvedValue(mockUser);
      vi.mocked(passwordService.verifyPassword).mockResolvedValue(true);

      const result = await authService.login(
        {
          identifier: 'alice_dev',
          password: 'Password123',
          deviceType: DeviceType.WEB,
          deviceId: 'web-browser-1',
        },
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(userService.findByIdentifier).toHaveBeenCalledWith('alice_dev');
      expect(passwordService.verifyPassword).toHaveBeenCalledWith(
        mockUser.passwordHash,
        'Password123',
      );
      expect(tokenService.generateTokenPair).toHaveBeenCalledWith({
        userId: mockUser.id,
        username: mockUser.username,
        deviceType: DeviceType.WEB,
        deviceId: 'web-browser-1',
      });
      expect(sessionService.saveSession).toHaveBeenCalledWith(
        mockUser.id,
        DeviceType.WEB,
        expect.objectContaining({
          deviceId: 'web-browser-1',
          accessTokenJti: 'mock-access-jti',
          refreshTokenJti: 'mock-refresh-jti',
          ip: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
        }),
      );
      expect(result).toMatchObject({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresIn: 900,
        user: {
          id: mockUser.id,
          username: mockUser.username,
          email: mockUser.email,
        },
      });
    });

    it('should kick out old device on same deviceType and blacklist its accessToken', async () => {
      vi.mocked(userService.findByIdentifier).mockResolvedValue(mockUser);
      vi.mocked(passwordService.verifyPassword).mockResolvedValue(true);
      vi.mocked(sessionService.getSession).mockResolvedValue({
        deviceId: 'old-web-browser',
        accessTokenJti: 'old-access-jti',
        refreshTokenJti: 'old-refresh-jti',
        lastLoginAt: '2026-09-18T10:00:00.000Z',
      });

      await authService.login({
        identifier: 'alice_dev',
        password: 'Password123',
        deviceType: DeviceType.WEB,
        deviceId: 'new-web-browser',
      });

      expect(sessionService.blacklistToken).toHaveBeenCalledWith(
        'old-access-jti',
        900,
        'kicked',
      );
    });

    it('should throw INVALID_CREDENTIALS when user is not found', async () => {
      vi.mocked(userService.findByIdentifier).mockResolvedValue(null);

      await expect(
        authService.login({
          identifier: 'non_existent',
          password: 'Password123',
          deviceType: DeviceType.WEB,
          deviceId: 'web-browser-1',
        }),
      ).rejects.toThrowError(BusinessException);
    });

    it('should throw INVALID_CREDENTIALS when password is wrong', async () => {
      vi.mocked(userService.findByIdentifier).mockResolvedValue(mockUser);
      vi.mocked(passwordService.verifyPassword).mockResolvedValue(false);

      await expect(
        authService.login({
          identifier: 'alice_dev',
          password: 'WrongPassword',
          deviceType: DeviceType.WEB,
          deviceId: 'web-browser-1',
        }),
      ).rejects.toThrowError(BusinessException);
    });

    it('should throw USER_DISABLED when user account is disabled', async () => {
      const disabledUser = { ...mockUser, status: UserStatus.DISABLED };
      vi.mocked(userService.findByIdentifier).mockResolvedValue(disabledUser);

      await expect(
        authService.login({
          identifier: 'alice_dev',
          password: 'Password123',
          deviceType: DeviceType.WEB,
          deviceId: 'web-browser-1',
        }),
      ).rejects.toThrowError(BusinessException);
    });
  });

  describe('refreshToken', () => {
    it('should successfully rotate tokens when refreshToken is valid and matching active session', async () => {
      vi.mocked(tokenService.verifyRefreshToken).mockResolvedValue({
        sub: mockUser.id,
        deviceType: DeviceType.WEB,
        deviceId: 'web-browser-1',
        jti: 'valid-refresh-jti-1',
      });
      vi.mocked(userService.findById).mockResolvedValue(mockUser);
      vi.mocked(sessionService.getSession).mockResolvedValue({
        deviceId: 'web-browser-1',
        refreshTokenJti: 'valid-refresh-jti-1',
        lastLoginAt: '2026-09-18T10:00:00.000Z',
      });

      const result = await authService.refreshToken({
        refreshToken: 'valid.refresh.jwt',
      });

      expect(tokenService.generateTokenPair).toHaveBeenCalledWith({
        userId: mockUser.id,
        username: mockUser.username,
        deviceType: DeviceType.WEB,
        deviceId: 'web-browser-1',
      });
      expect(sessionService.saveSession).toHaveBeenCalledWith(
        mockUser.id,
        DeviceType.WEB,
        expect.objectContaining({
          refreshTokenJti: 'mock-refresh-jti',
        }),
      );
      expect(result).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresIn: 900,
      });
    });

    it('should trigger Token Reuse Detection (Replay Defense) and delete session when jti does not match', async () => {
      vi.mocked(tokenService.verifyRefreshToken).mockResolvedValue({
        sub: mockUser.id,
        deviceType: DeviceType.WEB,
        deviceId: 'web-browser-1',
        jti: 'old-revoked-jti',
      });
      vi.mocked(userService.findById).mockResolvedValue(mockUser);
      vi.mocked(sessionService.getSession).mockResolvedValue({
        deviceId: 'web-browser-1',
        refreshTokenJti: 'new-active-jti',
        lastLoginAt: '2026-09-18T10:00:00.000Z',
      });

      await expect(
        authService.refreshToken({
          refreshToken: 'old.replayed.token',
        }),
      ).rejects.toThrowError(BusinessException);

      expect(sessionService.deleteSession).toHaveBeenCalledWith(
        mockUser.id,
        DeviceType.WEB,
      );

      try {
        await authService.refreshToken({
          refreshToken: 'old.replayed.token',
        });
      } catch (err: unknown) {
        const bErr = err as BusinessException;
        expect(bErr.code).toBe(ErrorCode.TOKEN_REUSE_DETECTED);
        expect(bErr.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      }
    });
  });

  describe('logout', () => {
    it('should blacklist access token and delete active device session', async () => {
      const result = await authService.logout(
        mockUser.id,
        DeviceType.WEB,
        'access-jti-to-blacklist',
      );

      expect(sessionService.blacklistToken).toHaveBeenCalledWith(
        'access-jti-to-blacklist',
        900,
        'logout',
      );
      expect(sessionService.deleteSession).toHaveBeenCalledWith(
        mockUser.id,
        DeviceType.WEB,
      );
      expect(result).toEqual({ loggedOut: true });
    });
  });

  describe('getProfile', () => {
    it('should return user profile with device info', async () => {
      vi.mocked(userService.findById).mockResolvedValue(mockUser);

      const profile = await authService.getProfile(
        mockUser.id,
        DeviceType.DESKTOP,
        'desktop-app-1',
      );

      expect(userService.findById).toHaveBeenCalledWith(mockUser.id);
      expect(profile).toMatchObject({
        id: mockUser.id,
        username: mockUser.username,
        email: mockUser.email,
        deviceType: DeviceType.DESKTOP,
        deviceId: 'desktop-app-1',
      });
    });

    it('should throw USER_DISABLED if user is disabled when fetching profile', async () => {
      const disabledUser = { ...mockUser, status: UserStatus.DISABLED };
      vi.mocked(userService.findById).mockResolvedValue(disabledUser);

      await expect(
        authService.getProfile(
          mockUser.id,
          DeviceType.DESKTOP,
          'desktop-app-1',
        ),
      ).rejects.toThrowError(BusinessException);
    });
  });
});
