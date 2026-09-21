import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AiService } from './ai.service.js';
import { ModelCatalogItemDto } from './dto/model-catalog-item.dto.js';
import { ChatRequestDto } from './dto/chat-request.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { BypassTransform } from '../../common/decorators/bypass-transform.decorator.js';
@ApiTags('AI 问答')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('models')
  @ApiOperation({ summary: '获取可切换的模型目录' })
  @ApiResponse({
    status: 200,
    description: '模型目录列表',
    type: [ModelCatalogItemDto],
  })
  getModels(): ModelCatalogItemDto[] {
    return this.aiService.getModels();
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @BypassTransform()
  @ApiResponse({
    status: 200,
    description: 'SSE 事件流 (meta -> delta* -> usage -> done)',
  })
  async chat(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChatRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.aiService.streamChat(userId, dto, res, req);
  }
}
