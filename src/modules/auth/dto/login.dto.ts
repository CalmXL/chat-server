import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DeviceType } from '../../../common/enums/index.js';

export class LoginDto {
  @ApiProperty({
    description: '用户名或邮箱',
    example: 'alice_dev',
  })
  @IsString()
  @IsNotEmpty({ message: 'identifier (username or email) cannot be empty' })
  identifier: string;

  @ApiProperty({
    description: '密码',
    example: 'Password123',
  })
  @IsString()
  @IsNotEmpty({ message: 'password cannot be empty' })
  password: string;

  @ApiProperty({
    description: '设备类型',
    enum: DeviceType,
    example: DeviceType.WEB,
  })
  @IsEnum(DeviceType, {
    message: 'deviceType must be one of: web, mobile, desktop, other',
  })
  deviceType: DeviceType;

  @ApiProperty({
    description: '设备唯一标识',
    example: 'browser-uuid-12345',
  })
  @IsString()
  @IsNotEmpty({ message: 'deviceId cannot be empty' })
  deviceId: string;
}
