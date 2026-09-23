import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

const secrets = {
  NODE_ENV: 'development',
  JWT_ACCESS_SECRET: 'a-very-long-secret-key-at-least-32-chars!',
  JWT_REFRESH_SECRET: 'another-very-long-secret-key-at-least-32-chars!',
};

describe('validateEnv AI provider resolution', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'env-validation-'));
    filePath = join(dir, 'ai-providers.json');
    writeFileSync(
      filePath,
      JSON.stringify([
        {
          id: 'deepseek',
          baseURL: 'https://api.deepseek.com/v1',
          apiKeyEnv: 'DEEPSEEK_API_KEY',
          models: [{ id: 'deepseek-flash', label: 'deepseek-flash' }],
        },
      ]),
      'utf8',
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('resolves providers from AI_PROVIDERS_FILE with apiKeyEnv', () => {
    const config = validateEnv({
      ...secrets,
      AI_PROVIDERS_FILE: filePath,
      DEEPSEEK_API_KEY: 'sk-from-env',
    });

    expect(config.AI_PROVIDERS).toHaveLength(1);
    expect(config.AI_PROVIDERS[0].apiKey).toBe('sk-from-env');
  });

  it('fails fast when no provider source is configured', () => {
    expect(() => validateEnv({ ...secrets })).toThrow(/Missing AI provider/);
  });

  it('fails fast when a referenced apiKeyEnv var is missing', () => {
    expect(() =>
      validateEnv({ ...secrets, AI_PROVIDERS_FILE: filePath }),
    ).toThrow(/DEEPSEEK_API_KEY/);
  });
});
