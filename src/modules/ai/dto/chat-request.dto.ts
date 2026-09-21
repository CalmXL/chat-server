import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class ChatRequestDto {
  @ApiPropertyOptional({
    description: '会话全局唯一标识。若为空则隐式创建新会话',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiProperty({
    description: '指定的模型唯一标识',
    example: 'deepseek-chat',
  })
  @IsString()
  @IsNotEmpty()
  modelId!: string;

  @ApiProperty({
    description: '用户提问正文内容',
    example: '请解释一下量子纠缠',
  })
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiPropertyOptional({
    description: '随本次提问携带的附件 ID 列表',
    example: ['123e4567-e89b-12d3-a456-426614174000'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}
