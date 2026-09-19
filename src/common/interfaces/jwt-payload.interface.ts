import { DeviceType } from '../enums/index.js';

export interface JwtPayload {
  sub: string; // userId
  username: string;
  deviceType: DeviceType;
  deviceId: string;
  jti: string;
}

export interface RefreshTokenPayload {
  sub: string; // userId
  deviceType: DeviceType;
  deviceId: string;
  jti: string;
}
