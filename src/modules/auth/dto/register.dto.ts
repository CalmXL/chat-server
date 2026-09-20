import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description: '用户名，仅字母、数字、下划线',
    minLength: 3,
    maxLength: 32,
    example: 'alice_dev',
  })
  @IsString()
  @IsNotEmpty({ message: 'username cannot be empty' })
  @Length(3, 32, { message: 'username must be between 3 and 32 characters' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'username can only contain letters, numbers, and underscores',
  })
  username: string;

  @ApiProperty({
    description: '邮箱',
    maxLength: 255,
    example: 'alice@example.com',
  })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @IsNotEmpty({ message: 'email cannot be empty' })
  @MaxLength(255, { message: 'email cannot exceed 255 characters' })
  email: string;

  @ApiProperty({
    description: '密码，8-64 位且必须同时包含字母和数字',
    minLength: 8,
    maxLength: 64,
    example: 'Password123',
  })
  @IsString()
  @IsNotEmpty({ message: 'password cannot be empty' })
  @Length(8, 64, { message: 'password must be between 8 and 64 characters' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'password must contain both letters and numbers',
  })
  password: string;

  @ApiPropertyOptional({
    description: '昵称',
    maxLength: 64,
    example: 'Alice',
  })
  @IsString()
  @IsOptional()
  @MaxLength(64, { message: 'nickname cannot exceed 64 characters' })
  nickname?: string;

  @ApiPropertyOptional({
    description: '头像 URL',
    maxLength: 512,
    example: 'https://example.com/avatar.png',
  })
  @IsString()
  @IsOptional()
  @MaxLength(512, { message: 'avatar cannot exceed 512 characters' })
  avatar?: string;
}
