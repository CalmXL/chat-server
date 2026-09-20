import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    description: '刷新令牌',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...',
  })
  @IsString()
  @IsNotEmpty({ message: 'refreshToken cannot be empty' })
  refreshToken: string;
}
