import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserModule } from '../user/user.module.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { SessionService } from './session.service.js';

@Module({
  imports: [
    UserModule,
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const expiresIn = configService.get<string>(
          'jwt.accessExpiresIn',
          '15m',
        );
        return {
          secret: configService.get<string>('jwt.accessSecret'),
          signOptions: {
            expiresIn:
              expiresIn as unknown as NonNullable<
                NonNullable<JwtModuleOptions['signOptions']>['expiresIn']
              >,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    SessionService,
  ],
  exports: [
    AuthService,
    PasswordService,
    TokenService,
    SessionService,
    JwtModule,
  ],
})
export class AuthModule {}
