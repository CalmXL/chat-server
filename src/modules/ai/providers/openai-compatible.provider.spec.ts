import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { OpenAiCompatibleProvider } from './openai-compatible.provider.js';
import type { AiProviderConfig } from '../../../config/env.validation.js';
import type {
  ChatRequest,
  UpstreamChunk,
} from '../interfaces/provider.interface.js';

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function providerWith(
  config: Partial<AiProviderConfig>,
): OpenAiCompatibleProvider {
  const provider: AiProviderConfig = {
    id: 'opencode-go',
    baseURL: 'https://opencode.ai/zen/go/v1',
    apiKey: 'sk-test',
    models: [{ id: 'kimi-k3', label: 'Kimi K3' }],
    ...config,
  };
  const configService = {
    get: () => [provider],
  } as unknown as ConfigService;
  return new OpenAiCompatibleProvider(configService);
}

async function collect(
  provider: OpenAiCompatibleProvider,
  req: ChatRequest,
): Promise<UpstreamChunk[]> {
  const out: UpstreamChunk[] = [];
  for await (const chunk of provider.streamChat(req, req.signal)) {
    out.push(chunk);
  }
  return out;
}

const baseRequest = (sessionId?: string): ChatRequest => ({
  modelId: 'kimi-k3',
  messages: [{ role: 'user', content: 'hi' }],
  signal: new AbortController().signal,
  sessionId,
});

describe('OpenAiCompatibleProvider headers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a dedicated user agent and the configured session header', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);

    const provider = providerWith({
      userAgent: 'chat-server/0.0.1',
      sessionHeader: 'x-opencode-session',
    });

    const chunks = await collect(provider, baseRequest('conv-123'));

    expect(chunks).toEqual([
      { delta: 'hi', usage: undefined, finishReason: undefined },
    ]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://opencode.ai/zen/go/v1/chat/completions');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer sk-test',
      'User-Agent': 'chat-server/0.0.1',
      'x-opencode-session': 'conv-123',
    });
  });

  it('falls back to the default user agent and omits the session header when unset', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse(['data: [DONE]\n\n']));
    vi.stubGlobal('fetch', fetchMock);

    const provider = providerWith({});
    await collect(provider, baseRequest());

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['User-Agent']).toBe('chat-server/0.0.1');
    expect(init.headers).not.toHaveProperty('x-opencode-session');
  });
});
