import { HttpStatus, Injectable } from '@nestjs/common';
import { UserService } from '../user/user.service.js';
import { PasswordService } from './password.service.js';
import { TokenService, TokenPair } from './token.service.js';
import { SessionService } from './session.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import {
  ErrorCode,
  ErrorMessages,
} from '../../common/constants/error-codes.js';
import { DeviceType, UserStatus } from '../../common/enums/index.js';
import { User } from '../user/entities/user.entity.js';

export interface UserProfileDto {
  id: string;
  username: string;
  email: string;
  nickname: string | null;
  avatar: string | null;
}

export interface UserResponseDto extends UserProfileDto {
  status: string;
  createdAt: Date;
}

export interface UserProfileWithDeviceDto extends UserResponseDto {
  deviceType: DeviceType;
  deviceId: string;
}

export interface LoginResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserProfileDto;
}

export interface RefreshTokenResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LogoutResponseDto {
  loggedOut: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
  ) {}

  async register(dto: RegisterDto): Promise<UserResponseDto> {
    const existingByUsername = await this.userService.findByUsername(
      dto.username,
    );
    if (existingByUsername) {
      throw new BusinessException(
        ErrorCode.USER_ALREADY_EXISTS,
        ErrorMessages[ErrorCode.USER_ALREADY_EXISTS],
        HttpStatus.CONFLICT,
      );
    }

    const existingByEmail = await this.userService.findByEmail(dto.email);
    if (existingByEmail) {
      throw new BusinessException(
        ErrorCode.USER_ALREADY_EXISTS,
        ErrorMessages[ErrorCode.USER_ALREADY_EXISTS],
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await this.passwordService.hashPassword(dto.password);

    const user = await this.userService.create({
      username: dto.username,
      email: dto.email,
      passwordHash,
      nickname: dto.nickname ?? null,
      avatar: dto.avatar ?? null,
    });

    return this.sanitizeUser(user);
  }

  async login(
    dto: LoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<LoginResponseDto> {
    const user = await this.userService.findByIdentifier(dto.identifier);
    if (!user) {
      throw new BusinessException(
        ErrorCode.INVALID_CREDENTIALS,
        ErrorMessages[ErrorCode.INVALID_CREDENTIALS],
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (user.status === UserStatus.DISABLED) {
      throw new BusinessException(
        ErrorCode.USER_DISABLED,
        ErrorMessages[ErrorCode.USER_DISABLED],
        HttpStatus.UNAUTHORIZED,
      );
    }

    const isPasswordValid = await this.passwordService.verifyPassword(
      user.passwordHash,
      dto.password,
    );
    if (!isPasswordValid) {
      throw new BusinessException(
        ErrorCode.INVALID_CREDENTIALS,
        ErrorMessages[ErrorCode.INVALID_CREDENTIALS],
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Check for existing session on the same deviceType (Same-device-type exclusivity / Kickout)
    const existingSession = await this.sessionService.getSession(
      user.id,
      dto.deviceType,
    );
    if (existingSession && existingSession.deviceId !== dto.deviceId) {
      // Different physical device on the same client type: kick out the old device session
      if (existingSession.accessTokenJti) {
        await this.sessionService.blacklistToken(
          existingSession.accessTokenJti,
          900,
          'kicked',
        );
      }
    }

    // Generate token pair
    const tokenPair: TokenPair = await this.tokenService.generateTokenPair({
      userId: user.id,
      username: user.username,
      deviceType: dto.deviceType,
      deviceId: dto.deviceId,
    });

    // Save or overwrite active session for this deviceType (7 days TTL)
    await this.sessionService.saveSession(user.id, dto.deviceType, {
      deviceId: dto.deviceId,
      accessTokenJti: tokenPair.accessTokenJti,
      refreshTokenJti: tokenPair.refreshTokenJti,
      lastLoginAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      ip,
      userAgent,
    });

    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresIn: tokenPair.expiresIn,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        nickname: user.nickname,
        avatar: user.avatar,
      },
    };
  }

  async refreshToken(dto: RefreshTokenDto): Promise<RefreshTokenResponseDto> {
    const payload = await this.tokenService.verifyRefreshToken(
      dto.refreshToken,
    );

    const user = await this.userService.findById(payload.sub);
    if (!user) {
      throw new BusinessException(
        ErrorCode.TOKEN_INVALID,
        'User not found',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (user.status === UserStatus.DISABLED) {
      throw new BusinessException(
        ErrorCode.USER_DISABLED,
        ErrorMessages[ErrorCode.USER_DISABLED],
        HttpStatus.UNAUTHORIZED,
      );
    }

    const session = await this.sessionService.getSession(
      payload.sub,
      payload.deviceType,
    );

    // If session doesn't exist at all
    if (!session) {
      throw new BusinessException(
        ErrorCode.TOKEN_INVALID,
        'Session expired or revoked',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Reuse Detection / Replay Attack Defense
    // If refreshTokenJti does not match what is currently registered in the active session,
    // it means a revoked / previously-rotated refresh token is being reused.
    if (
      session.refreshTokenJti !== payload.jti ||
      session.deviceId !== payload.deviceId
    ) {
      // Clear the active session immediately to protect user account
      await this.sessionService.deleteSession(payload.sub, payload.deviceType);
      throw new BusinessException(
        ErrorCode.TOKEN_REUSE_DETECTED,
        ErrorMessages[ErrorCode.TOKEN_REUSE_DETECTED],
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Issue brand new token pair (Token Rotation)
    const tokenPair = await this.tokenService.generateTokenPair({
      userId: user.id,
      username: user.username,
      deviceType: payload.deviceType,
      deviceId: payload.deviceId,
    });

    // Update Redis session with new accessTokenJti, refreshTokenJti and refresh TTL (7 days)
    await this.sessionService.saveSession(user.id, payload.deviceType, {
      ...session,
      accessTokenJti: tokenPair.accessTokenJti,
      refreshTokenJti: tokenPair.refreshTokenJti,
      lastActiveAt: new Date().toISOString(),
    });

    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresIn: tokenPair.expiresIn,
    };
  }

  async logout(
    userId: string,
    deviceType: DeviceType,
    accessTokenJti: string,
    ttlSeconds = 900,
  ): Promise<LogoutResponseDto> {
    // Blacklist access token
    if (accessTokenJti) {
      await this.sessionService.blacklistToken(
        accessTokenJti,
        ttlSeconds,
        'logout',
      );
    }

    // Remove active device session
    await this.sessionService.deleteSession(userId, deviceType);

    return { loggedOut: true };
  }

  async getProfile(
    userId: string,
    deviceType: DeviceType,
    deviceId: string,
  ): Promise<UserProfileWithDeviceDto> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new BusinessException(
        ErrorCode.INVALID_CREDENTIALS,
        'User not found',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (user.status === UserStatus.DISABLED) {
      throw new BusinessException(
        ErrorCode.USER_DISABLED,
        ErrorMessages[ErrorCode.USER_DISABLED],
        HttpStatus.UNAUTHORIZED,
      );
    }

    return {
      ...this.sanitizeUser(user),
      deviceType,
      deviceId,
    };
  }

  sanitizeUser(user: User): UserResponseDto {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      nickname: user.nickname,
      avatar: user.avatar,
      status: user.status,
      createdAt: user.createdAt,
    };
  }
}
