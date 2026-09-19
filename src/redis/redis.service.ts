import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { DeviceType } from '../common/enums/index.js';
import { REDIS_KEYS } from '../common/constants/redis-keys.js';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export interface SessionData {
  deviceId: string;
  accessTokenJti?: string;
  refreshTokenJti: string;
  lastLoginAt?: string;
  lastActiveAt?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {}

  getClient(): Redis {
    return this.redisClient;
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redisClient.quit();
    } catch {
      try {
        this.redisClient.disconnect();
      } catch (err) {
        this.logger.error('Error disconnecting Redis client:', err);
      }
    }
  }

  async get(key: string): Promise<string | null> {
    return this.redisClient.get(key);
  }

  async set(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<'OK' | null> {
    if (ttlSeconds !== undefined && ttlSeconds > 0) {
      return this.redisClient.set(key, value, 'EX', ttlSeconds);
    }
    return this.redisClient.set(key, value);
  }

  async del(key: string): Promise<number> {
    return this.redisClient.del(key);
  }

  async exists(key: string): Promise<number> {
    return this.redisClient.exists(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.redisClient.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return this.redisClient.ttl(key);
  }

  // === Session & Auth Helpers ===

  async getSession(
    userId: string,
    deviceType: DeviceType | string,
  ): Promise<SessionData | null> {
    const key = REDIS_KEYS.getAuthSessionKey(userId, deviceType);
    const data = await this.redisClient.get(key);
    if (!data) {
      return null;
    }
    try {
      return JSON.parse(data) as SessionData;
    } catch {
      return null;
    }
  }

  async setSession(
    userId: string,
    deviceType: DeviceType | string,
    session: SessionData,
    ttlSeconds = 7 * 24 * 60 * 60, // 7 days default
  ): Promise<void> {
    const key = REDIS_KEYS.getAuthSessionKey(userId, deviceType);
    await this.set(key, JSON.stringify(session), ttlSeconds);
  }

  async delSession(
    userId: string,
    deviceType: DeviceType | string,
  ): Promise<number> {
    const key = REDIS_KEYS.getAuthSessionKey(userId, deviceType);
    return this.del(key);
  }

  async isTokenBlacklisted(jti: string): Promise<boolean> {
    const key = REDIS_KEYS.getAuthBlacklistKey(jti);
    const result = await this.redisClient.exists(key);
    return result === 1;
  }

  async blacklistToken(
    jti: string,
    ttlSeconds: number,
    reason = 'logout',
  ): Promise<void> {
    if (ttlSeconds <= 0) {
      return;
    }
    const key = REDIS_KEYS.getAuthBlacklistKey(jti);
    await this.set(key, reason, Math.ceil(ttlSeconds));
  }
}
