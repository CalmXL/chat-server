import { describe, it, expect } from 'vitest';
import {
  PipelineContext,
  StreamPipeline,
} from './stream-pipeline.js';
import { UpstreamChunk } from '../interfaces/provider.interface.js';

describe('StreamPipeline', () => {
  it('should accumulate content and extract token usage by default', async () => {
    const pipeline = new StreamPipeline();
    const context: PipelineContext = {
      accumulatedContent: '',
      conversationId: 'conv-1',
      assistantMessageId: 'msg-1',
      modelId: 'gpt-4o',
    };

    const chunk1: UpstreamChunk = { delta: 'Hello' };
    const chunk2: UpstreamChunk = { delta: ' World' };
    const chunk3: UpstreamChunk = {
      usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
      finishReason: 'stop',
    };

    await pipeline.process(chunk1, context);
    await pipeline.process(chunk2, context);
    await pipeline.process(chunk3, context);

    expect(context.accumulatedContent).toBe('Hello World');
    expect(context.tokenUsage).toEqual({
      promptTokens: 10,
      completionTokens: 2,
      totalTokens: 12,
    });
    expect(context.finishReason).toBe('stop');
  });

  it('should execute custom stages in order', async () => {
    const pipeline = new StreamPipeline();
    const context: PipelineContext = {
      accumulatedContent: '',
      conversationId: 'conv-1',
      assistantMessageId: 'msg-1',
      modelId: 'gpt-4o',
    };

    // Add uppercase custom stage
    pipeline.use((chunk) => {
      if (chunk.delta) {
        return { ...chunk, delta: chunk.delta.toUpperCase() };
      }
      return chunk;
    });

    const chunk1: UpstreamChunk = { delta: 'ping' };
    const processed = await pipeline.process(chunk1, context);

    expect(processed?.delta).toBe('PING');
  });

  it('should halt pipeline if a stage returns null', async () => {
    const pipeline = new StreamPipeline();
    const context: PipelineContext = {
      accumulatedContent: '',
      conversationId: 'conv-1',
      assistantMessageId: 'msg-1',
      modelId: 'gpt-4o',
    };

    // Filter stage
    pipeline.use((chunk) => {
      if (chunk.delta === 'blocked') {
        return null;
      }
      return chunk;
    });

    const blocked = await pipeline.process({ delta: 'blocked' }, context);
    expect(blocked).toBeNull();
  });
});
