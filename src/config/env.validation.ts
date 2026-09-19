import { z } from 'zod';

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
