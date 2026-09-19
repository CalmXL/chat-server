import { Injectable } from '@nestjs/common';
import { RedisService, SessionData } from '../../redis/redis.service.js';
import { DeviceType } from '../../common/enums/index.js';

@Injectable()
export class SessionService {
  constructor(private readonly redisService: RedisService) {}

  async saveSession(
    userId: string,
    deviceType: DeviceType | string,
    session: SessionData,
    ttlSeconds = 7 * 24 * 60 * 60,
  ): Promise<void> {
    await this.redisService.setSession(
      userId,
      deviceType,
      session,
      ttlSeconds,
    );
  }

  async getSession(
    userId: string,
    deviceType: DeviceType | string,
  ): Promise<SessionData | null> {
    return this.redisService.getSession(userId, deviceType);
  }

  async deleteSession(
    userId: string,
    deviceType: DeviceType | string,
  ): Promise<number> {
    return this.redisService.delSession(userId, deviceType);
  }

  async isTokenBlacklisted(jti: string): Promise<boolean> {
    return this.redisService.isTokenBlacklisted(jti);
  }

  async blacklistToken(
    jti: string,
    ttlSeconds: number,
    reason = 'logout',
  ): Promise<void> {
    await this.redisService.blacklistToken(jti, ttlSeconds, reason);
  }
}
