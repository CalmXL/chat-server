import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateConversationDto {
  @ApiPropertyOptional({
    description: '会话标题',
    example: '关于 NestJS 的探讨',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  title?: string;
}
