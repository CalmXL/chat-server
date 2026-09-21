import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ConversationService } from './conversation.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { CreateConversationDto } from './dto/create-conversation.dto.js';
import { UpdateConversationDto } from './dto/update-conversation.dto.js';
import { ConversationQueryDto } from './dto/conversation-query.dto.js';
import { Conversation } from './entities/conversation.entity.js';
import { Message } from './entities/message.entity.js';

@ApiTags('会话管理')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  @ApiOperation({ summary: '创建会话' })
  @ApiResponse({ status: 201, description: '会话创建成功' })
  async createConversation(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateConversationDto,
  ): Promise<Conversation> {
    return this.conversationService.createConversation(userId, dto?.title);
  }

  @Get()
  @ApiOperation({ summary: '分页获取会话列表' })
  @ApiResponse({ status: 200, description: '会话列表' })
  async getConversations(
    @CurrentUser('sub') userId: string,
    @Query() query: ConversationQueryDto,
  ) {
    return this.conversationService.getConversations(userId, query);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: '获取指定会话的消息历史' })
  @ApiResponse({ status: 200, description: '消息历史列表' })
  async getConversationMessages(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ): Promise<Message[]> {
    return this.conversationService.getConversationMessages(userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '重命名会话' })
  @ApiResponse({ status: 200, description: '会话重命名成功' })
  async updateConversation(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ): Promise<Conversation> {
    return this.conversationService.updateConversation(userId, id, dto.title);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除会话' })
  @ApiResponse({ status: 200, description: '会话删除成功' })
  async deleteConversation(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return this.conversationService.deleteConversation(userId, id);
  }
}
