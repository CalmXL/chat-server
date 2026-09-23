import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service.js';
import { AiProviderConfig } from '../../config/env.validation.js';

describe('AiService (Model Catalog)', () => {
  let aiService: AiService;
  let mockConfigService: ConfigService;

  const mockProviders: AiProviderConfig[] = [
    {
      id: 'openai',
      label: 'OpenAI',
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'sk-secret-key-1',
      models: [
        { id: 'gpt-4o', label: 'GPT-4o' },
        { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      ],
    },
    {
      id: 'deepseek',
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: 'sk-secret-key-2',
      models: [{ id: 'deepseek-chat', label: 'DeepSeek Chat' }],
    },
  ];

  beforeEach(() => {
    mockConfigService = {
      get: (key: string) => {
        if (key === 'ai.providers') {
          return mockProviders;
        }
        return null;
      },
    } as unknown as ConfigService;

    aiService = new AiService(mockConfigService);
  });

  it('should return model catalog without api keys', () => {
    const models = aiService.getModels();
    expect(models).toEqual([
      {
        id: 'gpt-4o',
        label: 'GPT-4o',
        provider: 'openai',
        providerLabel: 'OpenAI',
      },
      {
        id: 'gpt-4o-mini',
        label: 'GPT-4o Mini',
        provider: 'openai',
        providerLabel: 'OpenAI',
      },
      {
        id: 'deepseek-chat',
        label: 'DeepSeek Chat',
        provider: 'deepseek',
        providerLabel: 'deepseek',
      },
    ]);

    for (const model of models) {
      expect((model as Record<string, unknown>).apiKey).toBeUndefined();
    }
  });

  it('should find provider configuration by modelId', () => {
    const match = aiService.getProviderForModel('deepseek-chat');
    expect(match).not.toBeNull();
    expect(match?.provider.id).toBe('deepseek');
    expect(match?.provider.baseURL).toBe('https://api.deepseek.com/v1');
    expect(match?.modelLabel).toBe('DeepSeek Chat');
  });

  it('should return null when modelId does not exist', () => {
    const match = aiService.getProviderForModel('non-existent-model');
    expect(match).toBeNull();
  });
});
