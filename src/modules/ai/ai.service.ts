import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AiProviderConfig } from '../../config/env.validation.js';
import { ModelCatalogItemDto } from './dto/model-catalog-item.dto.js';
import { ChatRequestDto } from './dto/chat-request.dto.js';
import { LLM_PROVIDER } from './interfaces/provider.interface.js';
import type { LlmProvider } from './interfaces/provider.interface.js';
import {
  PipelineContext,
  PipelineStage,
  StreamPipeline,
} from './pipeline/stream-pipeline.js';
import { ConversationService } from '../conversation/conversation.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import {
  ErrorCode,
  ErrorMessages,
} from '../../common/constants/error-codes.js';
import { MessageStatus } from '../../common/enums/index.js';

@Injectable()
export class AiService {
  private customStages: PipelineStage[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly conversationService: ConversationService,
    private readonly redisService: RedisService,
    @Inject(LLM_PROVIDER)
    private readonly llmProvider: LlmProvider,
  ) {}

  usePipelineStage(stage: PipelineStage): this {
    this.customStages.push(stage);
    return this;
  }

  getModels(): ModelCatalogItemDto[] {
    const providers =
      this.configService.get<AiProviderConfig[]>('ai.providers') || [];
    const models: ModelCatalogItemDto[] = [];
    for (const provider of providers) {
      for (const model of provider.models) {
        models.push({
          id: model.id,
          label: model.label,
          provider: provider.id,
          providerLabel: provider.label ?? provider.id,
        });
      }
    }
    return models;
  }

  getProviderForModel(
    modelId: string,
  ): { provider: AiProviderConfig; modelLabel: string } | null {
    const providers =
      this.configService.get<AiProviderConfig[]>('ai.providers') || [];
    for (const provider of providers) {
      const found = provider.models.find((m) => m.id === modelId);
      if (found) {
        return { provider, modelLabel: found.label };
      }
    }
    return null;
  }

  async streamChat(
    userId: string,
    dto: ChatRequestDto,
    res: Response,
    req: Request,
  ): Promise<void> {
    // 1. Validate modelId
    const modelMatch = this.getProviderForModel(dto.modelId);
    if (!modelMatch) {
      throw new BusinessException(
        ErrorCode.AI_MODEL_NOT_FOUND,
        ErrorMessages[ErrorCode.AI_MODEL_NOT_FOUND],
        HttpStatus.BAD_REQUEST,
      );
    }

    // 2. Guardrail: Rate Limiting
    const rateLimitRpm =
      this.configService.get<number>('ai.rateLimitRpm') || 20;
    const rateCheck = await this.redisService.checkAndIncrementRateLimit(
      userId,
      rateLimitRpm,
    );
    if (!rateCheck.allowed) {
      throw new BusinessException(
        ErrorCode.AI_RATE_LIMITED,
        ErrorMessages[ErrorCode.AI_RATE_LIMITED],
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 3. Guardrail: Concurrent Stream Slot
    const maxConcurrentStreams =
      this.configService.get<number>('ai.maxConcurrentStreams') || 3;
    const streamSlot = await this.redisService.acquireStreamSlot(
      userId,
      maxConcurrentStreams,
    );
    if (!streamSlot.allowed) {
      throw new BusinessException(
        ErrorCode.AI_CONCURRENT_STREAM_LIMIT,
        ErrorMessages[ErrorCode.AI_CONCURRENT_STREAM_LIMIT],
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let streamSlotAcquired = true;

    try {
      // 4. Conversation & Messages setup
      const conversation =
        await this.conversationService.findOrCreateConversation(
          userId,
          dto.conversationId,
          dto.content,
        );

      const { userMessage, assistantMessage, attachments } =
        await this.conversationService.prepareChatMessages(
          userId,
          conversation.id,
          dto.modelId,
          dto.content,
          dto.attachmentIds,
        );

      // 5. Setup AbortController & disconnect detection
      const abortController = new AbortController();
      let clientDisconnected = false;

      const onClose = () => {
        clientDisconnected = true;
        abortController.abort();
      };
      req.on('close', onClose);

      // 6. Context Assembly
      const assembledMessages =
        await this.conversationService.assembleContext(
          userId,
          conversation.id,
          dto.content,
          attachments,
          userMessage.id,
        );

      // 7. Send Response Headers (SSE)
      res.status(HttpStatus.OK);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      // 8. Heartbeat Interval (15s)
      const heartbeatInterval = setInterval(() => {
        if (!res.writableEnded) {
          res.write(': ping\n\n');
        }
      }, 15000);

      // 9. Emit meta event
      res.write(
        `event: meta\ndata: ${JSON.stringify({
          conversationId: conversation.id,
          messageId: assistantMessage.id,
          modelId: dto.modelId,
        })}\n\n`,
      );

      // 10. Pipeline setup
      const pipeline = new StreamPipeline();
      for (const stage of this.customStages) {
        pipeline.use(stage);
      }

      const pipelineContext: PipelineContext = {
        accumulatedContent: '',
        conversationId: conversation.id,
        assistantMessageId: assistantMessage.id,
        modelId: dto.modelId,
      };

      // 11. Stream Upstream Chunks
      try {
        const stream = this.llmProvider.streamChat(
          {
            modelId: dto.modelId,
            messages: assembledMessages,
            signal: abortController.signal,
            sessionId: conversation.id,
          },
          abortController.signal,
        );

        for await (const chunk of stream) {
          if (clientDisconnected || abortController.signal.aborted) {
            break;
          }

          const processed = await pipeline.process(chunk, pipelineContext);
          if (!processed) continue;

          if (processed.delta) {
            res.write(
              `event: delta\ndata: ${JSON.stringify({
                content: processed.delta,
              })}\n\n`,
            );
          }
        }

        if (clientDisconnected) {
          await this.conversationService.updateAssistantMessage(
            assistantMessage.id,
            MessageStatus.PARTIAL,
            pipelineContext.accumulatedContent,
            pipelineContext.tokenUsage,
          );
          await this.conversationService.touchConversation(conversation.id);
          return;
        }

        if (pipelineContext.tokenUsage) {
          res.write(
            `event: usage\ndata: ${JSON.stringify(
              pipelineContext.tokenUsage,
            )}\n\n`,
          );
        }

        const finishReason = pipelineContext.finishReason || 'stop';
        res.write(
          `event: done\ndata: ${JSON.stringify({
            messageId: assistantMessage.id,
            finishReason,
          })}\n\n`,
        );

        await this.conversationService.updateAssistantMessage(
          assistantMessage.id,
          MessageStatus.DONE,
          pipelineContext.accumulatedContent,
          pipelineContext.tokenUsage,
        );
        await this.conversationService.touchConversation(conversation.id);
      } catch (err: unknown) {
        if (clientDisconnected) {
          await this.conversationService.updateAssistantMessage(
            assistantMessage.id,
            MessageStatus.PARTIAL,
            pipelineContext.accumulatedContent,
            pipelineContext.tokenUsage,
          );
          await this.conversationService.touchConversation(conversation.id);
          return;
        }

        await this.conversationService.updateAssistantMessage(
          assistantMessage.id,
          MessageStatus.ERROR,
          pipelineContext.accumulatedContent,
          pipelineContext.tokenUsage,
        );
        await this.conversationService.touchConversation(conversation.id);

        const errorCode =
          (err as BusinessException).code || ErrorCode.AI_PROVIDER_ERROR;
        const errorMessage =
          (err as Error).message ||
          ErrorMessages[ErrorCode.AI_PROVIDER_ERROR];

        if (!res.writableEnded) {
          res.write(
            `event: error\ndata: ${JSON.stringify({
              code: errorCode,
              message: errorMessage,
            })}\n\n`,
          );
        }
      } finally {
        clearInterval(heartbeatInterval);
        req.off?.('close', onClose);
      }
    } finally {
      if (streamSlotAcquired) {
        await this.redisService.releaseStreamSlot(userId);
      }
      if (res.headersSent && !res.writableEnded) {
        res.end();
      }
    }
  }
}
