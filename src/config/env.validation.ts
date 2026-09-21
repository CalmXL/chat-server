import { z } from 'zod';

export const aiProviderModelSchema = z.object({
  id: z.string().min(1, 'Model id cannot be empty'),
  label: z.string().min(1, 'Model label cannot be empty'),
});

export const aiProviderSchema = z.object({
  id: z.string().min(1, 'Provider id cannot be empty'),
  baseURL: z.string().url('Provider baseURL must be a valid URL'),
  apiKey: z.string().min(1, 'Provider apiKey cannot be empty'),
  models: z
    .array(aiProviderModelSchema)
    .min(1, 'Provider must define at least one model'),
});

export type AiProviderConfig = z.infer<typeof aiProviderSchema>;
export type AiProviderModel = z.infer<typeof aiProviderModelSchema>;

export const envSchema = z
  .object({
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
    AI_MAX_CONCURRENT_STREAMS: z.coerce.number().default(3),
    AI_RATE_LIMIT_RPM: z.coerce.number().default(20),
    AI_MAX_UPLOAD_MB: z.coerce.number().default(10),
    AI_HISTORY_WINDOW: z.coerce.number().default(20),
    AI_DOC_TRUNCATE_CHARS: z.coerce.number().default(2000),
    UPLOAD_DIR: z.string().default('./uploads'),
    AI_SYSTEM_PROMPT: z.string().optional(),
  })
  .transform((data) => {
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

    let parsedProviders: unknown = data.AI_PROVIDERS_JSON;
    if (typeof parsedProviders === 'string' && parsedProviders.trim().length > 0) {
      try {
        parsedProviders = JSON.parse(parsedProviders);
      } catch (err) {
        throw new Error(
          `AI_PROVIDERS_JSON is not a valid JSON string: ${(err as Error).message}`,
        );
      }
    }

    // In test environment, provide deterministic test secrets & providers if omitted
    if (data.NODE_ENV === 'test') {
      const providers =
        (parsedProviders as AiProviderConfig[]) || defaultTestProviders;
      return {
        ...data,
        JWT_ACCESS_SECRET:
          data.JWT_ACCESS_SECRET ||
          'test-jwt-access-secret-key-min-32-chars-long!',
        JWT_REFRESH_SECRET:
          data.JWT_REFRESH_SECRET ||
          'test-jwt-refresh-secret-key-min-32-chars-long!',
        AI_PROVIDERS: providers,
      };
    }

    // In development / production, fail fast if secrets or AI_PROVIDERS_JSON are missing
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

    if (!parsedProviders) {
      throw new Error(
        'Missing AI_PROVIDERS_JSON. Fail-fast startup.',
      );
    }

    const validatedProviders = z
      .array(aiProviderSchema)
      .min(1, 'AI_PROVIDERS_JSON must contain at least one provider')
      .safeParse(parsedProviders);

    if (!validatedProviders.success) {
      throw new Error(
        `Invalid AI_PROVIDERS_JSON format: ${JSON.stringify(validatedProviders.error.format())}`,
      );
    }

    return {
      ...data,
      JWT_ACCESS_SECRET: data.JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET: data.JWT_REFRESH_SECRET,
      AI_PROVIDERS: validatedProviders.data,
    };
  });

export type EnvConfig = z.infer<typeof envSchema>;

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
  return parsed.data;
}
