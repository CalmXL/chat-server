import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import configuration from '../src/config/configuration.js';
import { validateEnv } from '../src/config/env.validation.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { SessionService } from '../src/modules/auth/session.service.js';
import { RedisService } from '../src/redis/redis.service.js';
import { User } from '../src/modules/user/entities/user.entity.js';
import { Conversation } from '../src/modules/conversation/entities/conversation.entity.js';
import { Message } from '../src/modules/conversation/entities/message.entity.js';
import { Attachment } from '../src/modules/upload/entities/attachment.entity.js';
import { ConversationController } from '../src/modules/conversation/conversation.controller.js';
import { ConversationService } from '../src/modules/conversation/conversation.service.js';
import { UploadController } from '../src/modules/upload/upload.controller.js';
import { UploadService } from '../src/modules/upload/upload.service.js';
import { AiController } from '../src/modules/ai/ai.controller.js';
import { AiService } from '../src/modules/ai/ai.service.js';
import {
  ChatRequest,
  LLM_PROVIDER,
  LlmProvider,
  UpstreamChunk,
} from '../src/modules/ai/interfaces/provider.interface.js';
import {
  AttachmentKind,
  DeviceType,
  MessageRole,
  MessageStatus,
  UserStatus,
} from '../src/common/enums/index.js';
import { ErrorCode } from '../src/common/constants/error-codes.js';

class InMemoryRepository<T extends { id?: string }> {
  public items: T[] = [];

  create(dto: Partial<T>): T {
    const item = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...dto,
    } as unknown as T;
    return item;
  }

  async save(entityOrEntities: T | T[]): Promise<T | T[]> {
    if (Array.isArray(entityOrEntities)) {
      for (const entity of entityOrEntities) {
        await this.saveOne(entity);
      }
      return entityOrEntities;
    }
    return this.saveOne(entityOrEntities);
  }

  private async saveOne(entity: T): Promise<T> {
    const existingIndex = this.items.findIndex((item) => item.id === entity.id);
    if (existingIndex >= 0) {
      this.items[existingIndex] = { ...this.items[existingIndex], ...entity };
    } else {
      this.items.push(entity);
    }
    return entity;
  }

  async findOne(options: {
    where: Record<string, unknown> | Array<Record<string, unknown>>;
    relations?: string[];
  }): Promise<T | null> {
    if (Array.isArray(options.where)) {
      for (const cond of options.where) {
        const found = this.matchItem(cond);
        if (found) return this.populateRelations(found, options.relations);
      }
      return null;
    }
    const found = this.matchItem(options.where);
    return found ? this.populateRelations(found, options.relations) : null;
  }

  async find(options?: {
    where?: Record<string, unknown>;
    relations?: string[];
    order?: Record<string, unknown>;
    take?: number;
  }): Promise<T[]> {
    let result = [...this.items];
    if (options?.where) {
      result = result.filter((item) => {
        for (const [k, v] of Object.entries(options.where!)) {
          if (typeof v === 'object' && v !== null && '_type' in (v as Record<string, unknown>)) {
            const op = v as { _type: string; _value: unknown };
            if (op._type === 'in' && Array.isArray(op._value)) {
              if (!op._value.includes((item as unknown as Record<string, unknown>)[k])) {
                return false;
              }
              continue;
            }
            if (op._type === 'not') {
              if ((item as unknown as Record<string, unknown>)[k] === op._value) {
                return false;
              }
              continue;
            }
          }
          if ((item as unknown as Record<string, unknown>)[k] !== v) {
            return false;
          }
        }
        return true;
      });
    }

    if (options?.take) {
      result = result.slice(0, options.take);
    }

    return result.map((item) => this.populateRelations(item, options?.relations));
  }

  async findAndCount(options?: {
    where?: Record<string, unknown>;
    skip?: number;
    take?: number;
    order?: Record<string, unknown>;
  }): Promise<[T[], number]> {
    let result = [...this.items];
    if (options?.where) {
      result = result.filter((item) => {
        for (const [k, v] of Object.entries(options.where!)) {
          if ((item as unknown as Record<string, unknown>)[k] !== v) {
            return false;
          }
        }
        return true;
      });
    }

    const total = result.length;
    const skip = options?.skip || 0;
    const take = options?.take || result.length;
    result = result.slice(skip, skip + take);

    return [result, total];
  }

  async remove(entity: T): Promise<T> {
    const idx = this.items.findIndex((item) => item.id === entity.id);
    if (idx >= 0) {
      this.items.splice(idx, 1);
    }
    return entity;
  }

  async update(id: string, partial: Partial<T>): Promise<void> {
    const idx = this.items.findIndex((item) => item.id === id);
    if (idx >= 0) {
      this.items[idx] = { ...this.items[idx], ...partial };
    }
  }

  private matchItem(cond: Record<string, unknown>): T | null {
    const found = this.items.find((item) => {
      for (const [k, v] of Object.entries(cond)) {
        if ((item as unknown as Record<string, unknown>)[k] !== v) {
          return false;
        }
      }
      return true;
    });
    return found ? { ...found } : null;
  }

  private populateRelations(item: T, _relations?: unknown): T {
    return { ...item };
  }

  clear() {
    this.items = [];
  }
}

class InMemoryRedisService {
  private store = new Map<string, string>();
  private blacklists = new Set<string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const existed = this.store.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return this.store.has(key) ? 1 : 0;
  }

  async expire(_key: string, _seconds: number): Promise<number> {
    return 1;
  }

  async incr(key: string): Promise<number> {
    const val = parseInt(this.store.get(key) || '0', 10) + 1;
    this.store.set(key, val.toString());
    return val;
  }

  async decr(key: string): Promise<number> {
    const val = parseInt(this.store.get(key) || '0', 10) - 1;
    this.store.set(key, val.toString());
    return val;
  }

  async isTokenBlacklisted(jti: string): Promise<boolean> {
    return this.blacklists.has(jti);
  }

  async checkAndIncrementRateLimit(
    userId: string,
    rpmLimit: number,
  ): Promise<{ allowed: boolean }> {
    const minute = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const key = `ai:rate:${userId}:${minute}`;
    const count = await this.incr(key);
    return { allowed: count <= rpmLimit };
  }

  async acquireStreamSlot(
    userId: string,
    maxStreams: number,
  ): Promise<{ allowed: boolean }> {
    const key = `ai:streams:${userId}`;
    const count = await this.incr(key);
    if (count > maxStreams) {
      await this.decr(key);
      return { allowed: false };
    }
    return { allowed: true };
  }

  async releaseStreamSlot(userId: string): Promise<void> {
    const key = `ai:streams:${userId}`;
    const count = await this.decr(key);
    if (count < 0) {
      this.store.set(key, '0');
    }
  }

  clear() {
    this.store.clear();
    this.blacklists.clear();
  }
}

class FakeLlmProvider implements LlmProvider {
  public receivedRequests: ChatRequest[] = [];
  public customGenerator?: (
    req: ChatRequest,
    signal: AbortSignal,
  ) => AsyncIterable<UpstreamChunk>;

  async *streamChat(
    req: ChatRequest,
    signal: AbortSignal,
  ): AsyncIterable<UpstreamChunk> {
    this.receivedRequests.push(req);
    if (this.customGenerator) {
      yield* this.customGenerator(req, signal);
      return;
    }

    yield { delta: '你好' };
    yield { delta: '！我是 AI 助手。' };
    yield {
      usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
      finishReason: 'stop',
    };
  }

  clear() {
    this.receivedRequests = [];
    this.customGenerator = undefined;
  }
}

describe('AI Chat & Streaming End-to-End Test Suite', () => {
  let app: INestApplication;
  let userRepo: InMemoryRepository<User>;
  let conversationRepo: InMemoryRepository<Conversation>;
  let messageRepo: InMemoryRepository<Message>;
  let attachmentRepo: InMemoryRepository<Attachment>;
  let redisService: InMemoryRedisService;
  let fakeLlmProvider: FakeLlmProvider;
  let tokenService: TokenService;
  let tempUploadDir: string;

  const testUser1: User = {
    id: 'user-uuid-1',
    username: 'user1',
    email: 'user1@example.com',
    passwordHash: 'hash',
    nickname: 'User One',
    avatar: null,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const testUser2: User = {
    id: 'user-uuid-2',
    username: 'user2',
    email: 'user2@example.com',
    passwordHash: 'hash',
    nickname: 'User Two',
    avatar: null,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let tokenUser1: string;
  let tokenUser2: string;

  beforeEach(async () => {
    tempUploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-uploads-'));

    userRepo = new InMemoryRepository<User>();
    conversationRepo = new InMemoryRepository<Conversation>();
    messageRepo = new InMemoryRepository<Message>();
    attachmentRepo = new InMemoryRepository<Attachment>();
    redisService = new InMemoryRedisService();
    fakeLlmProvider = new FakeLlmProvider();

    await userRepo.save(testUser1);
    await userRepo.save(testUser2);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              ...configuration(),
              ai: {
                ...configuration().ai,
                uploadDir: tempUploadDir,
                maxConcurrentStreams: 2,
                rateLimitRpm: 5,
                historyWindow: 10,
                docTruncateChars: 100,
              },
            }),
          ],
          validate: validateEnv,
        }),
        JwtModule.register({
          secret: 'chat-server-jwt-access-secret-key-min-32-chars-long!',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [AiController, ConversationController, UploadController],
      providers: [
        AiService,
        ConversationService,
        UploadService,
        TokenService,
        SessionService,
        {
          provide: getRepositoryToken(User),
          useValue: userRepo,
        },
        {
          provide: getRepositoryToken(Conversation),
          useValue: conversationRepo,
        },
        {
          provide: getRepositoryToken(Message),
          useValue: messageRepo,
        },
        {
          provide: getRepositoryToken(Attachment),
          useValue: attachmentRepo,
        },
        {
          provide: RedisService,
          useValue: redisService,
        },
        {
          provide: LLM_PROVIDER,
          useValue: fakeLlmProvider,
        },
        {
          provide: APP_GUARD,
          useClass: JwtAuthGuard,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    const reflector = app.get(Reflector);
    app.useGlobalInterceptors(new TransformInterceptor(reflector));
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();

    tokenService = moduleFixture.get(TokenService);
    const auth1 = await tokenService.generateTokenPair({
      userId: testUser1.id,
      username: testUser1.username,
      deviceType: DeviceType.WEB,
      deviceId: 'web-1',
    });
    tokenUser1 = auth1.accessToken;

    const auth2 = await tokenService.generateTokenPair({
      userId: testUser2.id,
      username: testUser2.username,
      deviceType: DeviceType.WEB,
      deviceId: 'web-2',
    });
    tokenUser2 = auth2.accessToken;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    try {
      await fs.rm(tempUploadDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('Ticket 02: Model Catalog (GET /ai/models)', () => {
    it('should reject unauthenticated requests with 401', async () => {
      await request(app.getHttpServer()).get('/ai/models').expect(401);
    });

    it('should return model catalog without api keys when authenticated', async () => {
      const res = await request(app.getHttpServer())
        .get('/ai/models')
        .set('Authorization', `Bearer ${tokenUser1}`)
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty('id');
      expect(res.body.data[0]).toHaveProperty('label');
      expect(res.body.data[0]).toHaveProperty('provider');
      expect(res.body.data[0].apiKey).toBeUndefined();
    });
  });

  describe('Ticket 03: Conversation CRUD', () => {
    it('should create conversation, query pagination, update title and delete', async () => {
      // 1. Create conversation
      const createRes = await request(app.getHttpServer())
        .post('/conversations')
        .set('Authorization', `Bearer ${tokenUser1}`)
        .send({ title: 'My First Topic' })
        .expect(201);

      expect(createRes.body.code).toBe(0);
      const conversationId = createRes.body.data.id;
      expect(createRes.body.data.title).toBe('My First Topic');

      // 2. Query list
      const listRes = await request(app.getHttpServer())
        .get('/conversations?page=1&size=10')
        .set('Authorization', `Bearer ${tokenUser1}`)
        .expect(200);

      expect(listRes.body.data.items).toHaveLength(1);
      expect(listRes.body.data.total).toBe(1);

      // 3. Update title
      const updateRes = await request(app.getHttpServer())
        .patch(`/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${tokenUser1}`)
        .send({ title: 'Renamed Topic' })
        .expect(200);

      expect(updateRes.body.data.title).toBe('Renamed Topic');

      // 4. Other user cannot access or update (40401)
      const unauthGetRes = await request(app.getHttpServer())
        .get(`/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${tokenUser2}`)
        .expect(404);

      expect(unauthGetRes.body.code).toBe(ErrorCode.CONVERSATION_NOT_FOUND);

      // 5. Delete conversation
      await request(app.getHttpServer())
        .delete(`/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${tokenUser1}`)
        .expect(200);

      expect(conversationRepo.items).toHaveLength(0);
    });
  });

  describe('Ticket 04: Attachment Upload & Download', () => {
    it('should upload files, return metadata and support raw stream download', async () => {
      const sampleText = '# Markdown Title\nSome content here.';
      const res = await request(app.getHttpServer())
        .post('/uploads')
        .set('Authorization', `Bearer ${tokenUser1}`)
        .attach('files', Buffer.from(sampleText), 'readme.md')
        .expect(201);

      expect(res.body.code).toBe(0);
      expect(res.body.data.attachmentIds).toHaveLength(1);
      const attachmentId = res.body.data.attachmentIds[0];

      // Get metadata
      const metaRes = await request(app.getHttpServer())
        .get(`/uploads/${attachmentId}`)
        .set('Authorization', `Bearer ${tokenUser1}`)
        .expect(200);

      expect(metaRes.body.data.filename).toBe('readme.md');
      expect(metaRes.body.data.extractedText).toBe(sampleText);
      expect(metaRes.body.data.kind).toBe(AttachmentKind.DOCUMENT);

      // Download file (raw stream, bypasses envelope)
      const downloadRes = await request(app.getHttpServer())
        .get(`/uploads/${attachmentId}/download`)
        .set('Authorization', `Bearer ${tokenUser1}`)
        .expect(200);

      expect(downloadRes.text).toBe(sampleText);
      // Ensure download does not have JSON envelope
      expect(downloadRes.body?.code).toBeUndefined();

      // User 2 cannot access (40402)
      await request(app.getHttpServer())
        .get(`/uploads/${attachmentId}`)
        .set('Authorization', `Bearer ${tokenUser2}`)
        .expect(404);
    });
  });

  describe('Ticket 05 & 06: SSE Chat Streaming & Context Assembly', () => {
    it('should stream SSE response, implicitly create conversation and assemble context', async () => {
      const res = await request(app.getHttpServer())
        .post('/ai/chat')
        .set('Authorization', `Bearer ${tokenUser1}`)
        .send({
          modelId: 'gpt-4o',
          content: '请写一首关于春天的诗',
        })
        .expect(200);

      expect(res.headers['content-type']).toContain('text/event-stream');
      const text = res.text;

      expect(text).toContain('event: meta');
      expect(text).toContain('event: delta');
      expect(text).toContain('event: usage');
      expect(text).toContain('event: done');

      // Verify conversation was created in DB
      expect(conversationRepo.items).toHaveLength(1);
      expect(conversationRepo.items[0].title).toBe('请写一首关于春天的诗');

      // Verify user & assistant messages in DB
      const messages = messageRepo.items;
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe(MessageRole.USER);
      expect(messages[1].role).toBe(MessageRole.ASSISTANT);
      expect(messages[1].status).toBe(MessageStatus.DONE);
      expect(messages[1].content).toBe('你好！我是 AI 助手。');
      expect(messages[1].tokenUsage).toEqual({
        promptTokens: 20,
        completionTokens: 10,
        totalTokens: 30,
      });
    });

    it('should support custom pipeline stage registered on AiService', async () => {
      const aiService = app.get(AiService);
      // Register custom uppercase stage
      aiService.usePipelineStage((chunk) => {
        if (chunk.delta) {
          return { ...chunk, delta: chunk.delta.toUpperCase() };
        }
        return chunk;
      });

      const res = await request(app.getHttpServer())
        .post('/ai/chat')
        .set('Authorization', `Bearer ${tokenUser1}`)
        .send({
          modelId: 'gpt-4o',
          content: 'test uppercase',
        })
        .expect(200);

      expect(res.text).toContain('event: delta');
      // The assistant message in DB will reflect the custom pipeline
      const assistantMsg = messageRepo.items.find((m) => m.role === MessageRole.ASSISTANT);
      expect(assistantMsg?.content).toBe('你好！我是 AI 助手。'.toUpperCase());
    });
  });

  describe('Ticket 07: Attachments in Chat', () => {
    it('should bind attachments and assemble vision image URL & document in chat', async () => {
      // 1. Upload an image and a text file
      const uploadRes = await request(app.getHttpServer())
        .post('/uploads')
        .set('Authorization', `Bearer ${tokenUser1}`)
        .attach('files', Buffer.from('image-bytes-mock'), 'photo.jpg')
        .attach('files', Buffer.from('document-content-text'), 'summary.txt')
        .expect(201);

      const [imgId, docId] = uploadRes.body.data.attachmentIds;

      // 2. Chat with attachments
      await request(app.getHttpServer())
        .post('/ai/chat')
        .set('Authorization', `Bearer ${tokenUser1}`)
        .send({
          modelId: 'gpt-4o',
          content: '请结合图片和文档回答',
          attachmentIds: [imgId, docId],
        })
        .expect(200);

      // Verify request received by fake provider
      expect(fakeLlmProvider.receivedRequests).toHaveLength(1);
      const req = fakeLlmProvider.receivedRequests[0];
      const userMsg = req.messages.find((m) => m.role === 'user');
      expect(userMsg).toBeDefined();

      // Vision image should be formatted with image_url and document text inline
      expect(Array.isArray(userMsg?.content)).toBe(true);
      const parts = userMsg?.content as Array<{ type: string; image_url?: { url: string }; text?: string }>;
      expect(parts.some((p) => p.type === 'image_url')).toBe(true);
      expect(parts.some((p) => p.type === 'text' && p.text?.includes('document-content-text'))).toBe(true);

      // Verify attachment was bound in DB
      const boundAttachments = attachmentRepo.items.filter((a) => a.messageId !== null);
      expect(boundAttachments).toHaveLength(2);
    });
  });

  describe('Ticket 08: Cost Guardrails (Rate Limit & Concurrent Streams)', () => {
    it('should enforce rate limit RPM and return 42901', async () => {
      // Configured RPM is 5
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/ai/chat')
          .set('Authorization', `Bearer ${tokenUser1}`)
          .send({ modelId: 'gpt-4o', content: `q ${i}` })
          .expect(200);
      }

      // 6th request should hit rate limit
      const rateLimitRes = await request(app.getHttpServer())
        .post('/ai/chat')
        .set('Authorization', `Bearer ${tokenUser1}`)
        .send({ modelId: 'gpt-4o', content: 'hit limit' })
        .expect(429);

      expect(rateLimitRes.body.code).toBe(ErrorCode.AI_RATE_LIMITED);
    });

    it('should enforce concurrent stream limit and return 42902', async () => {
      // Occupy stream slots directly in Redis (maxConcurrentStreams is 2)
      await redisService.set(`ai:streams:${testUser2.id}`, '2');

      const res = await request(app.getHttpServer())
        .post('/ai/chat')
        .set('Authorization', `Bearer ${tokenUser2}`)
        .send({ modelId: 'gpt-4o', content: 'concurrent blocked' })
        .expect(429);

      expect(res.body.code).toBe(ErrorCode.AI_CONCURRENT_STREAM_LIMIT);
    });

    it('should return 40010 when modelId does not exist', async () => {
      const res = await request(app.getHttpServer())
        .post('/ai/chat')
        .set('Authorization', `Bearer ${tokenUser1}`)
        .send({ modelId: 'non-existent-model', content: 'hello' })
        .expect(400);

      expect(res.body.code).toBe(ErrorCode.AI_MODEL_NOT_FOUND);
    });

    it('should return 40402 when attachment does not belong to user', async () => {
      // Upload file as User 2
      const uploadRes = await request(app.getHttpServer())
        .post('/uploads')
        .set('Authorization', `Bearer ${tokenUser2}`)
        .attach('files', Buffer.from('secret'), 'secret.txt')
        .expect(201);

      const otherUserAttId = uploadRes.body.data.attachmentIds[0];

      // User 1 tries to use it in chat
      const res = await request(app.getHttpServer())
        .post('/ai/chat')
        .set('Authorization', `Bearer ${tokenUser1}`)
        .send({
          modelId: 'gpt-4o',
          content: 'steal file',
          attachmentIds: [otherUserAttId],
        })
        .expect(404);

      expect(res.body.code).toBe(ErrorCode.ATTACHMENT_NOT_FOUND);
    });

    it('should handle upstream stream error and emit error event and set message status ERROR', async () => {
      fakeLlmProvider.customGenerator = async function* () {
        yield { delta: 'Partial chunk before error' };
        throw new Error('Upstream provider crashed');
      };

      const res = await request(app.getHttpServer())
        .post('/ai/chat')
        .set('Authorization', `Bearer ${tokenUser1}`)
        .send({
          modelId: 'gpt-4o',
          content: 'trigger error',
        })
        .expect(200);

      expect(res.text).toContain('event: error');
      expect(res.text).toContain('Upstream provider crashed');

      const assistantMsg = messageRepo.items.find(
        (m) => m.role === MessageRole.ASSISTANT && m.content.includes('Partial chunk'),
      );
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg?.status).toBe(MessageStatus.ERROR);
    });
  });
});
