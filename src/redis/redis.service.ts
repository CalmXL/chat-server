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

  async incr(key: string): Promise<number> {
    return this.redisClient.incr(key);
  }

  async decr(key: string): Promise<number> {
    return this.redisClient.decr(key);
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

  // === AI Chat Guardrail Helpers ===

  async checkAndIncrementRateLimit(
    userId: string,
    rpmLimit: number,
  ): Promise<{ allowed: boolean }> {
    const minute = new Date()
      .toISOString()
      .slice(0, 16)
      .replace(/[-:T]/g, '');
    const key = REDIS_KEYS.getAiRateLimitKey(userId, minute);
    const count = await this.redisClient.incr(key);
    if (count === 1) {
      await this.redisClient.expire(key, 60);
    }
    return { allowed: count <= rpmLimit };
  }

  async acquireStreamSlot(
    userId: string,
    maxStreams: number,
  ): Promise<{ allowed: boolean }> {
    const key = REDIS_KEYS.getAiStreamKey(userId);
    const count = await this.redisClient.incr(key);
    await this.redisClient.expire(key, 600); // 10 minutes safety TTL
    if (count > maxStreams) {
      await this.redisClient.decr(key);
      return { allowed: false };
    }
    return { allowed: true };
  }

  async releaseStreamSlot(userId: string): Promise<void> {
    const key = REDIS_KEYS.getAiStreamKey(userId);
    const count = await this.redisClient.decr(key);
    if (count < 0) {
      await this.redisClient.set(key, '0', 'EX', 600);
    }
  }
}
