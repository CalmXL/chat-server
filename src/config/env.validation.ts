import { z } from 'zod';
import { resolveAiProviders } from './ai-providers.loader.js';
import type { AiProviderConfig } from './ai-providers.loader.js';

export {
  aiProviderModelSchema,
  aiProviderSchema,
} from './ai-providers.loader.js';
export type {
  AiProviderConfig,
  AiProviderModel,
} from './ai-providers.loader.js';

const defaultTestProviders: AiProviderConfig[] = [
  {
    id: 'test-provider',
    baseURL: 'https://api.openai.com/v1',
    apiKey: 'sk-test-key-12345678',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'deepseek-chat', label: 'DeepSeek Chat' },
    ],
  },
];

export const envSchema = z
  // Loose object: keep undeclared vars (e.g. provider API keys referenced by
  // apiKeyEnv) so @nestjs/config re-assigns them to process.env for the
  // `configuration` load factory to read.
  .looseObject({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().default(3000),
    DATABASE_HOST: z.string().default('localhost'),
    DATABASE_PORT: z.coerce.number().default(5432),
    DATABASE_USERNAME: z.string().default('postgres'),
    DATABASE_PASSWORD: z.string().default('postgres'),
    DATABASE_NAME: z.string().default('chat_server'),
    DATABASE_SYNCHRONIZE: z
      .preprocess(
        (val) => val === 'true' || val === true || val === undefined,
        z.boolean(),
      )
      .default(true),
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.coerce.number().default(6379),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: z.coerce.number().default(0),
    JWT_ACCESS_SECRET: z.string().min(16).optional(),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_SECRET: z.string().min(16).optional(),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    AI_PROVIDERS_JSON: z.unknown().optional(),
    AI_PROVIDERS_FILE: z.string().optional(),
    AI_MAX_CONCURRENT_STREAMS: z.coerce.number().default(3),
    AI_RATE_LIMIT_RPM: z.coerce.number().default(20),
    AI_MAX_UPLOAD_MB: z.coerce.number().default(10),
    AI_HISTORY_WINDOW: z.coerce.number().default(20),
    AI_DOC_TRUNCATE_CHARS: z.coerce.number().default(2000),
    UPLOAD_DIR: z.string().default('./uploads'),
    AI_SYSTEM_PROMPT: z.string().optional(),
  })
  .transform((data) => {
    // In test environment, provide deterministic test secrets if omitted
    if (data.NODE_ENV === 'test') {
      return {
        ...data,
        JWT_ACCESS_SECRET:
          data.JWT_ACCESS_SECRET ||
          'test-jwt-access-secret-key-min-32-chars-long!',
        JWT_REFRESH_SECRET:
          data.JWT_REFRESH_SECRET ||
          'test-jwt-refresh-secret-key-min-32-chars-long!',
      };
    }

    // In development / production, fail fast if secrets are missing
    if (!data.JWT_ACCESS_SECRET || data.JWT_ACCESS_SECRET.length < 16) {
      throw new Error(
        'Missing or invalid JWT_ACCESS_SECRET (must be at least 16 characters). Fail-fast startup.',
      );
    }
    if (!data.JWT_REFRESH_SECRET || data.JWT_REFRESH_SECRET.length < 16) {
      throw new Error(
        'Missing or invalid JWT_REFRESH_SECRET (must be at least 16 characters). Fail-fast startup.',
      );
    }

    return {
      ...data,
      JWT_ACCESS_SECRET: data.JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET: data.JWT_REFRESH_SECRET,
    };
  });

export type EnvConfig = z.infer<typeof envSchema> & {
  AI_PROVIDERS: AiProviderConfig[];
};

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    console.error(
      '❌ Environment configuration validation error:',
      parsed.error.format(),
    );
    throw new Error(
      `Config validation error: ${JSON.stringify(parsed.error.format())}`,
    );
  }

  const data = parsed.data;

  // Resolve providers from the raw env record (not the stripped parse output)
  // so `apiKeyEnv` references can be looked up.
  let providers = resolveAiProviders(config);

  if (!providers) {
    if (data.NODE_ENV === 'test') {
      providers = defaultTestProviders;
    } else {
      throw new Error(
        'Missing AI provider configuration. Set AI_PROVIDERS_FILE (recommended) or AI_PROVIDERS_JSON. Fail-fast startup.',
      );
    }
  }

  return { ...data, AI_PROVIDERS: providers };
}
