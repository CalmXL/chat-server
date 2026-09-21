import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { TokenService } from '../../modules/auth/token.service.js';
import { SessionService } from '../../modules/auth/session.service.js';
import { BusinessException } from '../exceptions/business.exception.js';
import { ErrorCode, ErrorMessages } from '../constants/error-codes.js';
import { JwtPayload } from '../interfaces/jwt-payload.interface.js';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
  rawToken?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    /**
     * Reflector 专门用来读取通过装饰器 DI 主题到构造函数
     *
     * getAllAndOverride: 读取元数据 + 处理优先级。它按照数组顺序查找标记聊天 IS_PUBLIC_KEY 的元数据。
     */
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new BusinessException(
        ErrorCode.TOKEN_INVALID,
        ErrorMessages[ErrorCode.TOKEN_INVALID],
        HttpStatus.UNAUTHORIZED,
      );
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new BusinessException(
        ErrorCode.TOKEN_INVALID,
        ErrorMessages[ErrorCode.TOKEN_INVALID],
        HttpStatus.UNAUTHORIZED,
      );
    }

    const payload = await this.tokenService.verifyAccessToken(token);

    // Check if token JTI has been blacklisted (logout or kicked out)
    const isBlacklisted = await this.sessionService.isTokenBlacklisted(
      payload.jti,
    );
    if (isBlacklisted) {
      throw new BusinessException(
        ErrorCode.TOKEN_REVOKED,
        ErrorMessages[ErrorCode.TOKEN_REVOKED],
        HttpStatus.UNAUTHORIZED,
      );
    }

    request.user = payload;
    request.rawToken = token;
    return true;
  }
}
