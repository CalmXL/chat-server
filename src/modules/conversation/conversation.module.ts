import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity.js';
import { Message } from './entities/message.entity.js';
import { Attachment } from '../upload/entities/attachment.entity.js';
import { ConversationController } from './conversation.controller.js';
import { ConversationService } from './conversation.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation, Message, Attachment])],
  controllers: [ConversationController],
  providers: [ConversationService],
  exports: [ConversationService, TypeOrmModule],
})
export class ConversationModule {}
