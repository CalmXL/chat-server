import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  JwtPayload,
  RefreshTokenPayload,
} from '../../common/interfaces/jwt-payload.interface.js';
import { DeviceType } from '../../common/enums/index.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { ErrorCode, ErrorMessages } from '../../common/constants/error-codes.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  accessTokenJti: string;
  refreshTokenJti: string;
}

@Injectable()
export class TokenService {
  private readonly accessSecret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshSecret: string;
  private readonly refreshExpiresIn: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.accessSecret = this.configService.get<string>(
      'jwt.accessSecret',
      'chat-server-jwt-access-secret-key-min-32-chars-long!',
    );
    this.accessExpiresIn = this.configService.get<string>(
      'jwt.accessExpiresIn',
      '15m',
    );
    this.refreshSecret = this.configService.get<string>(
      'jwt.refreshSecret',
      'chat-server-jwt-refresh-secret-key-min-32-chars-long!',
    );
    this.refreshExpiresIn = this.configService.get<string>(
      'jwt.refreshExpiresIn',
      '7d',
    );
  }

  async generateTokenPair(params: {
    userId: string;
    username: string;
    deviceType: DeviceType;
    deviceId: string;
  }): Promise<TokenPair> {
    const accessTokenJti = randomUUID();
    const refreshTokenJti = randomUUID();

    const accessPayload: JwtPayload = {
      sub: params.userId,
      username: params.username,
      deviceType: params.deviceType,
      deviceId: params.deviceId,
      jti: accessTokenJti,
    };

    const refreshPayload: RefreshTokenPayload = {
      sub: params.userId,
      deviceType: params.deviceType,
      deviceId: params.deviceId,
      jti: refreshTokenJti,
    };

    const accessSignOptions: JwtSignOptions = {
      secret: this.accessSecret,
      expiresIn: this.accessExpiresIn as unknown as JwtSignOptions['expiresIn'],
    };

    const refreshSignOptions: JwtSignOptions = {
      secret: this.refreshSecret,
      expiresIn: this
        .refreshExpiresIn as unknown as JwtSignOptions['expiresIn'],
    };

    const accessToken = await this.jwtService.signAsync(
      accessPayload,
      accessSignOptions,
    );

    const refreshToken = await this.jwtService.signAsync(
      refreshPayload,
      refreshSignOptions,
    );

    const expiresIn = this.parseExpiresInToSeconds(this.accessExpiresIn);

    return {
      accessToken,
      refreshToken,
      expiresIn,
      accessTokenJti,
      refreshTokenJti,
    };
  }

  async verifyAccessToken(token: string): Promise<JwtPayload> {
    return this.verifyTokenInternal<JwtPayload>(token, this.accessSecret);
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    return this.verifyTokenInternal<RefreshTokenPayload>(
      token,
      this.refreshSecret,
    );
  }

  private async verifyTokenInternal<T extends object>(
    token: string,
    secret: string,
  ): Promise<T> {
    try {
      return await this.jwtService.verifyAsync<T>(token, {
        secret,
      });
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'name' in err &&
        err.name === 'TokenExpiredError'
      ) {
        throw new BusinessException(
          ErrorCode.TOKEN_EXPIRED,
          ErrorMessages[ErrorCode.TOKEN_EXPIRED],
          HttpStatus.UNAUTHORIZED,
        );
      }
      throw new BusinessException(
        ErrorCode.TOKEN_INVALID,
        ErrorMessages[ErrorCode.TOKEN_INVALID],
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  private parseExpiresInToSeconds(expiresIn: string | number): number {
    if (typeof expiresIn === 'number') {
      return expiresIn;
    }
    const match = expiresIn.match(/^(\d+)([smhd]?)$/);
    if (!match) {
      return 900;
    }
    const val = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 's':
        return val;
      case 'm':
        return val * 60;
      case 'h':
        return val * 3600;
      case 'd':
        return val * 86400;
      default:
        return val;
    }
  }
}
