import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import * as fs from 'fs/promises';
import { Conversation } from './entities/conversation.entity.js';
import { Message } from './entities/message.entity.js';
import { Attachment } from '../upload/entities/attachment.entity.js';
import { ConversationQueryDto } from './dto/conversation-query.dto.js';
import {
  AttachmentKind,
  MessageRole,
  MessageStatus,
} from '../../common/enums/index.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import {
  ErrorCode,
  ErrorMessages,
} from '../../common/constants/error-codes.js';
import {
  AssembledMessage,
  MessageContentPart,
  TokenUsage,
} from '../ai/interfaces/provider.interface.js';

export interface PaginatedConversations {
  items: Conversation[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

export interface PreparedChatContext {
  conversation: Conversation;
  userMessage: Message;
  assistantMessage: Message;
  attachments: Attachment[];
}

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(Attachment)
    private readonly attachmentRepo: Repository<Attachment>,
    private readonly configService: ConfigService,
  ) {}

  async createConversation(
    userId: string,
    title?: string,
  ): Promise<Conversation> {
    const trimmedTitle = title?.trim() || '新建会话';
    const conversation = this.conversationRepo.create({
      userId,
      title: trimmedTitle,
      lastMessageAt: null,
    });
    return this.conversationRepo.save(conversation);
  }

  async getConversations(
    userId: string,
    query: ConversationQueryDto,
  ): Promise<PaginatedConversations> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const size = query.size && query.size > 0 ? query.size : 20;
    const skip = (page - 1) * size;

    const [items, total] = await this.conversationRepo.findAndCount({
      where: { userId },
      order: {
        lastMessageAt: {
          direction: 'DESC',
          nulls: 'LAST',
        },
        createdAt: 'DESC',
      },
      skip,
      take: size,
    });

    return {
      items,
      total,
      page,
      size,
      totalPages: Math.ceil(total / size) || 1,
    };
  }

  async findUserConversation(
    userId: string,
    conversationId: string,
  ): Promise<Conversation> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId, userId },
    });
    if (!conversation) {
      throw new BusinessException(
        ErrorCode.CONVERSATION_NOT_FOUND,
        ErrorMessages[ErrorCode.CONVERSATION_NOT_FOUND],
        HttpStatus.NOT_FOUND,
      );
    }
    return conversation;
  }

  async getConversationMessages(
    userId: string,
    conversationId: string,
  ): Promise<Message[]> {
    await this.findUserConversation(userId, conversationId);

    return this.messageRepo.find({
      where: { conversationId },
      relations: { attachments: true },
      order: { createdAt: 'ASC' },
    });
  }

  async updateConversation(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<Conversation> {
    const conversation = await this.findUserConversation(
      userId,
      conversationId,
    );
    conversation.title = title.trim();
    return this.conversationRepo.save(conversation);
  }

  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ success: boolean }> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId, userId },
      relations: { messages: { attachments: true } },
    });

    if (!conversation) {
      throw new BusinessException(
        ErrorCode.CONVERSATION_NOT_FOUND,
        ErrorMessages[ErrorCode.CONVERSATION_NOT_FOUND],
        HttpStatus.NOT_FOUND,
      );
    }

    if (conversation.messages) {
      for (const msg of conversation.messages) {
        if (msg.attachments) {
          for (const att of msg.attachments) {
            if (att.storagePath) {
              try {
                await fs.unlink(att.storagePath);
              } catch {
                // Ignore file system errors if file already removed
              }
            }
          }
        }
      }
    }

    await this.conversationRepo.remove(conversation);
    return { success: true };
  }

  async findOrCreateConversation(
    userId: string,
    conversationId?: string,
    firstContent?: string,
  ): Promise<Conversation> {
    if (conversationId) {
      return this.findUserConversation(userId, conversationId);
    }
    const title = firstContent?.slice(0, 20) || '新建会话';
    return this.createConversation(userId, title);
  }

  async prepareChatMessages(
    userId: string,
    conversationId: string,
    modelId: string,
    content: string,
    attachmentIds?: string[],
  ): Promise<{
    userMessage: Message;
    assistantMessage: Message;
    attachments: Attachment[];
  }> {
    let attachments: Attachment[] = [];

    if (attachmentIds && attachmentIds.length > 0) {
      attachments = await this.attachmentRepo.find({
        where: { id: In(attachmentIds), uploaderId: userId },
      });

      if (attachments.length !== attachmentIds.length) {
        throw new BusinessException(
          ErrorCode.ATTACHMENT_NOT_FOUND,
          ErrorMessages[ErrorCode.ATTACHMENT_NOT_FOUND],
          HttpStatus.NOT_FOUND,
        );
      }

      for (const att of attachments) {
        if (att.messageId !== null) {
          throw new BusinessException(
            ErrorCode.ATTACHMENT_NOT_FOUND,
            ErrorMessages[ErrorCode.ATTACHMENT_NOT_FOUND],
            HttpStatus.NOT_FOUND,
          );
        }
      }
    }

    // Insert user message
    const userMessage = this.messageRepo.create({
      conversationId,
      role: MessageRole.USER,
      content,
      status: MessageStatus.DONE,
    });
    const savedUserMessage = await this.messageRepo.save(userMessage);

    // Bind attachments to user message
    if (attachments.length > 0) {
      for (const att of attachments) {
        att.messageId = savedUserMessage.id;
      }
      await this.attachmentRepo.save(attachments);
    }

    // Insert assistant message (streaming)
    const assistantMessage = this.messageRepo.create({
      conversationId,
      role: MessageRole.ASSISTANT,
      content: '',
      modelId,
      status: MessageStatus.STREAMING,
    });
    const savedAssistantMessage =
      await this.messageRepo.save(assistantMessage);

    return {
      userMessage: savedUserMessage,
      assistantMessage: savedAssistantMessage,
      attachments,
    };
  }

  async assembleContext(
    userId: string,
    conversationId: string,
    currentContent: string,
    currentAttachments: Attachment[],
    currentUserMessageId: string,
  ): Promise<AssembledMessage[]> {
    const historyWindow =
      this.configService.get<number>('ai.historyWindow') || 20;
    const docTruncateChars =
      this.configService.get<number>('ai.docTruncateChars') || 2000;
    const systemPrompt =
      this.configService.get<string>('ai.systemPrompt') || undefined;

    // Retrieve previous messages (excluding current streaming assistant & current user message)
    const historyMessages = await this.messageRepo.find({
      where: {
        conversationId,
        id: Not(currentUserMessageId),
        status: Not(MessageStatus.STREAMING),
      },
      relations: { attachments: true },
      order: { createdAt: 'DESC' },
      take: historyWindow,
    });

    historyMessages.reverse();

    const assembled: AssembledMessage[] = [];

    if (systemPrompt && systemPrompt.trim().length > 0) {
      assembled.push({ role: 'system', content: systemPrompt.trim() });
    }

    for (const msg of historyMessages) {
      if (msg.role === MessageRole.USER) {
        let text = '';
        const docTexts: string[] = [];
        const imgPlaceholders: string[] = [];

        if (msg.attachments && msg.attachments.length > 0) {
          for (const att of msg.attachments) {
            if (att.kind === AttachmentKind.DOCUMENT && att.extractedText) {
              const fullText = att.extractedText;
              const truncated =
                fullText.length > docTruncateChars
                  ? `${fullText.slice(0, docTruncateChars)}...[截断]`
                  : fullText;
              docTexts.push(`[文档: ${att.filename}]\n${truncated}`);
            } else if (att.kind === AttachmentKind.IMAGE) {
              imgPlaceholders.push(`[图片: ${att.filename}]`);
            }
          }
        }

        if (docTexts.length > 0) {
          text += docTexts.join('\n\n') + '\n\n';
        }
        if (imgPlaceholders.length > 0) {
          text += imgPlaceholders.join(' ') + '\n\n';
        }
        text += msg.content;
        assembled.push({ role: 'user', content: text.trim() });
      } else if (msg.role === MessageRole.ASSISTANT) {
        assembled.push({ role: 'assistant', content: msg.content });
      }
    }

    // Current round user message
    let currentText = '';
    const currentDocTexts: string[] = [];
    const currentImages: Attachment[] = [];

    for (const att of currentAttachments) {
      if (att.kind === AttachmentKind.DOCUMENT && att.extractedText) {
        currentDocTexts.push(
          `[文档: ${att.filename}]\n${att.extractedText}`,
        );
      } else if (att.kind === AttachmentKind.IMAGE) {
        currentImages.push(att);
      }
    }

    if (currentDocTexts.length > 0) {
      currentText += currentDocTexts.join('\n\n') + '\n\n';
    }
    currentText += currentContent;
    currentText = currentText.trim();

    if (currentImages.length > 0) {
      const parts: MessageContentPart[] = [];
      for (const img of currentImages) {
        try {
          const buf = await fs.readFile(img.storagePath);
          const base64 = buf.toString('base64');
          const dataUrl = `data:${img.mimeType};base64,${base64}`;
          parts.push({ type: 'image_url', image_url: { url: dataUrl } });
        } catch {
          parts.push({ type: 'text', text: `[图片: ${img.filename}]` });
        }
      }
      parts.push({ type: 'text', text: currentText });
      assembled.push({ role: 'user', content: parts });
    } else {
      assembled.push({ role: 'user', content: currentText });
    }

    return assembled;
  }

  async updateAssistantMessage(
    messageId: string,
    status: MessageStatus,
    content: string,
    tokenUsage?: TokenUsage,
  ): Promise<void> {
    await this.messageRepo.update(messageId, {
      status,
      content,
      tokenUsage: tokenUsage || null,
      updatedAt: new Date(),
    });
  }

  async touchConversation(conversationId: string): Promise<void> {
    await this.conversationRepo.update(conversationId, {
      lastMessageAt: new Date(),
    });
  }
}
