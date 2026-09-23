import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveAiProviders } from './ai-providers.loader.js';

const catalog = [
  {
    id: 'deepseek',
    baseURL: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    models: [{ id: 'deepseek-flash', label: 'deepseek-flash' }],
  },
];

describe('resolveAiProviders', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ai-providers-'));
    filePath = join(dir, 'ai-providers.json');
    writeFileSync(filePath, JSON.stringify(catalog), 'utf8');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns undefined when no source is configured', () => {
    expect(resolveAiProviders({})).toBeUndefined();
  });

  it('loads providers from AI_PROVIDERS_FILE and resolves apiKeyEnv', () => {
    const providers = resolveAiProviders({
      AI_PROVIDERS_FILE: filePath,
      DEEPSEEK_API_KEY: 'sk-from-env',
    });

    expect(providers).toHaveLength(1);
    expect(providers?.[0].id).toBe('deepseek');
    expect(providers?.[0].apiKey).toBe('sk-from-env');
  });

  it('throws when a referenced apiKeyEnv var is missing', () => {
    expect(() => resolveAiProviders({ AI_PROVIDERS_FILE: filePath })).toThrow(
      /DEEPSEEK_API_KEY/,
    );
  });

  it('throws when the providers file does not exist', () => {
    expect(() =>
      resolveAiProviders({ AI_PROVIDERS_FILE: join(dir, 'missing.json') }),
    ).toThrow(/Unable to read AI providers file/);
  });

  it('prefers AI_PROVIDERS_JSON over AI_PROVIDERS_FILE', () => {
    const providers = resolveAiProviders({
      AI_PROVIDERS_FILE: filePath,
      DEEPSEEK_API_KEY: 'sk-from-env',
      AI_PROVIDERS_JSON: JSON.stringify([
        {
          id: 'inline',
          baseURL: 'https://api.openai.com/v1',
          apiKey: 'sk-inline',
          models: [{ id: 'gpt-4o', label: 'GPT-4o' }],
        },
      ]),
    });

    expect(providers?.map((p) => p.id)).toEqual(['inline']);
    expect(providers?.[0].apiKey).toBe('sk-inline');
  });

  it('rejects a provider declaring neither or both of apiKey and apiKeyEnv', () => {
    const base = {
      id: 'x',
      baseURL: 'https://api.openai.com/v1',
      models: [{ id: 'm', label: 'M' }],
    };

    expect(() =>
      resolveAiProviders({ AI_PROVIDERS_JSON: JSON.stringify([base]) }),
    ).toThrow(/Invalid AI provider configuration/);

    expect(() =>
      resolveAiProviders({
        AI_PROVIDERS_JSON: JSON.stringify([
          { ...base, apiKey: 'sk-a', apiKeyEnv: 'X_KEY' },
        ]),
      }),
    ).toThrow(/Invalid AI provider configuration/);
  });
});
