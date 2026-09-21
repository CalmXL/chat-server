import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChatRequest,
  LlmProvider,
  UpstreamChunk,
} from '../interfaces/provider.interface.js';
import { AiProviderConfig } from '../../../config/env.validation.js';
import { BusinessException } from '../../../common/exceptions/business.exception.js';
import {
  ErrorCode,
  ErrorMessages,
} from '../../../common/constants/error-codes.js';

@Injectable()
export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(private readonly configService: ConfigService) {}

  private findProviderConfig(modelId: string): AiProviderConfig | null {
    const providers =
      this.configService.get<AiProviderConfig[]>('ai.providers') || [];
    for (const p of providers) {
      if (p.models.some((m) => m.id === modelId)) {
        return p;
      }
    }
    return null;
  }

  async *streamChat(
    req: ChatRequest,
    signal: AbortSignal,
  ): AsyncIterable<UpstreamChunk> {
    const provider = this.findProviderConfig(req.modelId);
    if (!provider) {
      throw new BusinessException(
        ErrorCode.AI_MODEL_NOT_FOUND,
        ErrorMessages[ErrorCode.AI_MODEL_NOT_FOUND],
        HttpStatus.BAD_REQUEST,
      );
    }

    const url = `${provider.baseURL.replace(/\/+$/, '')}/chat/completions`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: req.modelId,
          messages: req.messages,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal,
      });
    } catch (err: unknown) {
      if (signal.aborted) {
        return;
      }
      throw new BusinessException(
        ErrorCode.AI_PROVIDER_ERROR,
        `AI 供应商网络连接异常: ${(err as Error).message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new BusinessException(
        ErrorCode.AI_PROVIDER_ERROR,
        `AI 供应商上游请求失败: ${response.status} ${response.statusText} ${errorText}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (!response.body) {
      throw new BusinessException(
        ErrorCode.AI_PROVIDER_ERROR,
        'AI 供应商上游未返回响应流',
        HttpStatus.BAD_GATEWAY,
      );
    }

    let buffer = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6).trim();
            if (dataStr === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              const finishReason = parsed.choices?.[0]?.finish_reason;
              let usage = undefined;
              if (parsed.usage) {
                usage = {
                  promptTokens: parsed.usage.prompt_tokens,
                  completionTokens: parsed.usage.completion_tokens,
                  totalTokens: parsed.usage.total_tokens,
                };
              }

              if (delta || usage || finishReason) {
                yield { delta, usage, finishReason };
              }
            } catch {
              // Ignore unparseable or partial lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
