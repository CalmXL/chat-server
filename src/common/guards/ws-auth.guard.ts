import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { TokenService } from '../../modules/auth/token.service.js';
import { SessionService } from '../../modules/auth/session.service.js';
import { JwtPayload } from '../interfaces/jwt-payload.interface.js';

export interface WsSocketLike {
  handshake: {
    auth?: {
      token?: string;
    };
    headers?: {
      authorization?: string;
    };
  };
  data: {
    user?: JwtPayload;
  };
}

@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<WsSocketLike>();
    if (!client || !client.handshake) {
      return false;
    }

    let token = client.handshake.auth?.token;
    if (!token && client.handshake.headers?.authorization) {
      const authHeader = client.handshake.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }
    }

    if (!token) {
      return false;
    }

    try {
      const payload = await this.tokenService.verifyAccessToken(token);
      const isBlacklisted = await this.sessionService.isTokenBlacklisted(
        payload.jti,
      );
      if (isBlacklisted) {
        return false;
      }
      client.data = client.data || {};
      client.data.user = payload;
      return true;
    } catch {
      return false;
    }
  }
}
