export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface UpstreamChunk {
  delta?: string;
  usage?: TokenUsage;
  finishReason?: 'stop' | 'length' | string;
}

export type MessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface AssembledMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | MessageContentPart[];
}

export interface ChatRequest {
  modelId: string;
  messages: AssembledMessage[];
  signal: AbortSignal;
}

export interface LlmProvider {
  streamChat(
    req: ChatRequest,
    signal: AbortSignal,
  ): AsyncIterable<UpstreamChunk>;
}

export const LLM_PROVIDER = 'LLM_PROVIDER';
