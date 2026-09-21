import { ApiProperty } from '@nestjs/swagger';

export class ModelCatalogItemDto {
  @ApiProperty({ description: '模型全局唯一标识', example: 'deepseek-chat' })
  id!: string;

  @ApiProperty({ description: '模型展示名称', example: 'DeepSeek Chat' })
  label!: string;

  @ApiProperty({ description: '模型归属供应商标识', example: 'deepseek' })
  provider!: string;
}
