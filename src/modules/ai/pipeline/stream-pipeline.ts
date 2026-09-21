import { TokenUsage, UpstreamChunk } from '../interfaces/provider.interface.js';

export interface PipelineContext {
  accumulatedContent: string;
  tokenUsage?: TokenUsage;
  finishReason?: string;
  conversationId: string;
  assistantMessageId: string;
  modelId: string;
}

export type PipelineStage = (
  chunk: UpstreamChunk,
  context: PipelineContext,
) => Promise<UpstreamChunk | null> | UpstreamChunk | null;

export class StreamPipeline {
  private stages: PipelineStage[] = [];

  constructor() {
    this.use(this.accumulateStage);
    this.use(this.usageExtractStage);
  }

  use(stage: PipelineStage): this {
    this.stages.push(stage);
    return this;
  }

  getStages(): PipelineStage[] {
    return [...this.stages];
  }

  private accumulateStage: PipelineStage = (chunk, context) => {
    if (chunk.delta) {
      context.accumulatedContent += chunk.delta;
    }
    return chunk;
  };

  private usageExtractStage: PipelineStage = (chunk, context) => {
    if (chunk.usage) {
      context.tokenUsage = chunk.usage;
    }
    if (chunk.finishReason) {
      context.finishReason = chunk.finishReason;
    }
    return chunk;
  };

  async process(
    chunk: UpstreamChunk,
    context: PipelineContext,
  ): Promise<UpstreamChunk | null> {
    let currentChunk: UpstreamChunk | null = chunk;
    for (const stage of this.stages) {
      if (!currentChunk) break;
      currentChunk = await stage(currentChunk, context);
    }
    return currentChunk;
  }
}
