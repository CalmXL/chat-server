import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateConversationDto {
  @ApiProperty({ description: '新的会话标题', example: '重命名的会话' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  title!: string;
}
