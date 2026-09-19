import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { DeviceType } from '../../../common/enums/index.js';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'identifier (username or email) cannot be empty' })
  identifier: string;

  @IsString()
  @IsNotEmpty({ message: 'password cannot be empty' })
  password: string;

  @IsEnum(DeviceType, {
    message: 'deviceType must be one of: web, mobile, desktop, other',
  })
  deviceType: DeviceType;

  @IsString()
  @IsNotEmpty({ message: 'deviceId cannot be empty' })
  deviceId: string;
}
