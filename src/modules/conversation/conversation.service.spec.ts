import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ConversationService } from './conversation.service.js';
import { Conversation } from './entities/conversation.entity.js';
import { Message } from './entities/message.entity.js';
import { Attachment } from '../upload/entities/attachment.entity.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { ErrorCode } from '../../common/constants/error-codes.js';
import {
  AttachmentKind,
  MessageRole,
  MessageStatus,
} from '../../common/enums/index.js';

describe('ConversationService', () => {
  let service: ConversationService;
  let conversationRepo: Repository<Conversation>;
  let messageRepo: Repository<Message>;
  let attachmentRepo: Repository<Attachment>;
  let configService: ConfigService;

  const userId = 'user-111';
  const otherUserId = 'user-222';

  beforeEach(() => {
    conversationRepo = {
      create: vi.fn((dto) => ({
        id: 'conv-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...dto,
      })),
      save: vi.fn(async (entity) => entity),
      findAndCount: vi.fn(async () => [[], 0]),
      findOne: vi.fn(async () => null),
      remove: vi.fn(async (entity) => entity),
      update: vi.fn(async () => ({})),
    } as unknown as Repository<Conversation>;

    messageRepo = {
      create: vi.fn((dto) => ({
        id: 'msg-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...dto,
      })),
      save: vi.fn(async (entity) => entity),
      find: vi.fn(async () => []),
      findOne: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
    } as unknown as Repository<Message>;

    attachmentRepo = {
      create: vi.fn((dto) => ({ id: 'att-1', ...dto })),
      save: vi.fn(async (entity) => entity),
      find: vi.fn(async () => []),
      findOne: vi.fn(async () => null),
    } as unknown as Repository<Attachment>;

    configService = {
      get: (key: string) => {
        if (key === 'ai.historyWindow') return 20;
        if (key === 'ai.docTruncateChars') return 2000;
        if (key === 'ai.systemPrompt') return 'You are a helpful assistant';
        return null;
      },
    } as unknown as ConfigService;

    service = new ConversationService(
      conversationRepo,
      messageRepo,
      attachmentRepo,
      configService,
    );
  });

  describe('createConversation', () => {
    it('should create a conversation with provided title', async () => {
      const result = await service.createConversation(userId, 'My Topic');
      expect(conversationRepo.create).toHaveBeenCalledWith({
        userId,
        title: 'My Topic',
        lastMessageAt: null,
      });
      expect(result.title).toBe('My Topic');
    });

    it('should create a conversation with default title if omitted', async () => {
      const result = await service.createConversation(userId);
      expect(conversationRepo.create).toHaveBeenCalledWith({
        userId,
        title: '新建会话',
        lastMessageAt: null,
      });
      expect(result.title).toBe('新建会话');
    });
  });

  describe('getConversations', () => {
    it('should query conversations with pagination and ordering', async () => {
      const mockList = [
        { id: 'conv-1', title: 'A', userId } as Conversation,
        { id: 'conv-2', title: 'B', userId } as Conversation,
      ];
      vi.mocked(conversationRepo.findAndCount).mockResolvedValue([mockList, 2]);

      const result = await service.getConversations(userId, {
        page: 1,
        size: 10,
      });
      expect(conversationRepo.findAndCount).toHaveBeenCalledWith({
        where: { userId },
        order: {
          lastMessageAt: {
            direction: 'DESC',
            nulls: 'LAST',
          },
          createdAt: 'DESC',
        },
        skip: 0,
        take: 10,
      });
      expect(result.items).toEqual(mockList);
      expect(result.total).toBe(2);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('getConversationMessages', () => {
    it('should return messages for owned conversation', async () => {
      vi.mocked(conversationRepo.findOne).mockResolvedValue({
        id: 'conv-1',
        userId,
        title: 'Topic',
      } as Conversation);

      const mockMessages = [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          role: MessageRole.USER,
          content: 'Hi',
          status: MessageStatus.DONE,
          attachments: [],
        } as unknown as Message,
      ];
      vi.mocked(messageRepo.find).mockResolvedValue(mockMessages);

      const result = await service.getConversationMessages(userId, 'conv-1');
      expect(result).toEqual(mockMessages);
      expect(messageRepo.find).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1' },
        relations: { attachments: true },
        order: { createdAt: 'ASC' },
      });
    });

    it('should throw 40401 CONVERSATION_NOT_FOUND when conversation not found or owned by other', async () => {
      vi.mocked(conversationRepo.findOne).mockResolvedValue(null);

      await expect(
        service.getConversationMessages(otherUserId, 'conv-1'),
      ).rejects.toThrowError(BusinessException);

      try {
        await service.getConversationMessages(otherUserId, 'conv-1');
      } catch (err: unknown) {
        expect((err as BusinessException).code).toBe(
          ErrorCode.CONVERSATION_NOT_FOUND,
        );
      }
    });
  });

  describe('updateConversation', () => {
    it('should update conversation title when owned', async () => {
      const existing = {
        id: 'conv-1',
        userId,
        title: 'Old Title',
      } as Conversation;
      vi.mocked(conversationRepo.findOne).mockResolvedValue(existing);

      const result = await service.updateConversation(
        userId,
        'conv-1',
        'New Title',
      );
      expect(result.title).toBe('New Title');
      expect(conversationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'New Title' }),
      );
    });

    it('should throw 40401 when updating non-existent or other user conversation', async () => {
      vi.mocked(conversationRepo.findOne).mockResolvedValue(null);

      await expect(
        service.updateConversation(otherUserId, 'conv-1', 'New Title'),
      ).rejects.toThrowError(BusinessException);
    });
  });

  describe('deleteConversation', () => {
    it('should remove conversation and return success', async () => {
      const existing = {
        id: 'conv-1',
        userId,
        title: 'Title',
        messages: [],
      } as unknown as Conversation;
      vi.mocked(conversationRepo.findOne).mockResolvedValue(existing);

      const result = await service.deleteConversation(userId, 'conv-1');
      expect(result).toEqual({ success: true });
      expect(conversationRepo.remove).toHaveBeenCalledWith(existing);
    });

    it('should throw 40401 when deleting non-existent or other user conversation', async () => {
      vi.mocked(conversationRepo.findOne).mockResolvedValue(null);

      await expect(
        service.deleteConversation(otherUserId, 'conv-1'),
      ).rejects.toThrowError(BusinessException);
    });
  });

  describe('findOrCreateConversation', () => {
    it('should find existing conversation when conversationId is provided', async () => {
      const conv = { id: 'conv-123', userId, title: 'Existing' } as Conversation;
      vi.mocked(conversationRepo.findOne).mockResolvedValue(conv);

      const res = await service.findOrCreateConversation(userId, 'conv-123');
      expect(res).toBe(conv);
    });

    it('should create new conversation with first 20 chars of content when conversationId is omitted', async () => {
      const res = await service.findOrCreateConversation(
        userId,
        undefined,
        '这是一个超过二十个字的用户提问内容用来测试会话标题生成逻辑',
      );
      expect(res.title).toBe('这是一个超过二十个字的用户提问内容用来测');
    });
  });

  describe('prepareChatMessages', () => {
    it('should prepare user & streaming assistant messages and bind attachments', async () => {
      const mockAttachment = {
        id: 'att-1',
        uploaderId: userId,
        messageId: null,
      } as Attachment;
      vi.mocked(attachmentRepo.find).mockResolvedValue([mockAttachment]);

      const res = await service.prepareChatMessages(
        userId,
        'conv-1',
        'deepseek-chat',
        'Hello AI',
        ['att-1'],
      );

      expect(res.userMessage.role).toBe(MessageRole.USER);
      expect(res.assistantMessage.role).toBe(MessageRole.ASSISTANT);
      expect(res.assistantMessage.status).toBe(MessageStatus.STREAMING);
      expect(mockAttachment.messageId).toBe(res.userMessage.id);
    });

    it('should throw 40402 when attachment already bound to another message', async () => {
      const alreadyBound = {
        id: 'att-1',
        uploaderId: userId,
        messageId: 'msg-already-bound',
      } as Attachment;
      vi.mocked(attachmentRepo.find).mockResolvedValue([alreadyBound]);

      try {
        await service.prepareChatMessages(
          userId,
          'conv-1',
          'deepseek-chat',
          'Hello AI',
          ['att-1'],
        );
        expect.unreachable('Should throw');
      } catch (err: unknown) {
        expect((err as BusinessException).code).toBe(
          ErrorCode.ATTACHMENT_NOT_FOUND,
        );
      }
    });
  });

  describe('assembleContext', () => {
    it('should assemble system prompt, history messages and format attachments', async () => {
      const historyMsg1 = {
        id: 'msg-h1',
        role: MessageRole.USER,
        content: 'Previous user question',
        attachments: [
          {
            id: 'att-h1',
            kind: AttachmentKind.IMAGE,
            filename: 'pic.jpg',
          } as Attachment,
          {
            id: 'att-h2',
            kind: AttachmentKind.DOCUMENT,
            filename: 'doc.txt',
            extractedText: 'A very long document text content',
          } as Attachment,
        ],
      } as unknown as Message;

      const historyMsg2 = {
        id: 'msg-h2',
        role: MessageRole.ASSISTANT,
        content: 'Previous AI answer',
        attachments: [],
      } as unknown as Message;

      vi.mocked(messageRepo.find).mockResolvedValue([historyMsg2, historyMsg1]);

      const currentDoc = {
        id: 'att-curr-1',
        kind: AttachmentKind.DOCUMENT,
        filename: 'report.txt',
        extractedText: 'Current report text',
      } as Attachment;

      const context = await service.assembleContext(
        userId,
        'conv-1',
        'Current question',
        [currentDoc],
        'msg-current-user',
      );

      expect(context[0]).toEqual({
        role: 'system',
        content: 'You are a helpful assistant',
      });
      // Check history user message contains image placeholder and document
      expect(context[1].role).toBe('user');
      expect(context[1].content).toContain('[图片: pic.jpg]');
      expect(context[1].content).toContain('[文档: doc.txt]');
      expect(context[1].content).toContain('Previous user question');

      // Check history assistant message
      expect(context[2]).toEqual({
        role: 'assistant',
        content: 'Previous AI answer',
      });

      // Check current user message has full doc text
      expect(context[3].role).toBe('user');
      expect(context[3].content).toContain('[文档: report.txt]');
      expect(context[3].content).toContain('Current report text');
      expect(context[3].content).toContain('Current question');
    });
  });
});
