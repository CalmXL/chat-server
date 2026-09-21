import { DeviceType } from '../enums/index.js';

export const REDIS_KEYS = {
  AUTH_SESSION_PREFIX: 'auth:session',
  AUTH_BLACKLIST_PREFIX: 'auth:blacklist',

  getAuthSessionKey(userId: string, deviceType: DeviceType | string): string {
    return `auth:session:${userId}:${deviceType}`;
  },

  getAuthBlacklistKey(jti: string): string {
    return `auth:blacklist:${jti}`;
  },

  getAiStreamKey(userId: string): string {
    return `ai:streams:${userId}`;
  },

  getAiRateLimitKey(userId: string, minuteWindow: string): string {
    return `ai:rate:${userId}:${minuteWindow}`;
  },
} as const;
