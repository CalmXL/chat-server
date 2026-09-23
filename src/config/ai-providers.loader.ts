import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

export const aiProviderModelSchema = z.object({
  id: z.string().min(1, 'Model id cannot be empty'),
  label: z.string().min(1, 'Model label cannot be empty'),
});

const aiProviderInputSchema = z
  .object({
    id: z.string().min(1, 'Provider id cannot be empty'),
    baseURL: z.string().url('Provider baseURL must be a valid URL'),
    apiKey: z.string().min(1, 'Provider apiKey cannot be empty').optional(),
    apiKeyEnv: z
      .string()
      .min(1, 'Provider apiKeyEnv cannot be empty')
      .optional(),
    models: z
      .array(aiProviderModelSchema)
      .min(1, 'Provider must define at least one model'),
  })
  .refine(
    (provider) => Boolean(provider.apiKey) !== Boolean(provider.apiKeyEnv),
    { message: 'Provider must define exactly one of apiKey or apiKeyEnv' },
  );

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

const providersArraySchema = z
  .array(aiProviderInputSchema)
  .min(1, 'AI provider config must contain at least one provider');

function parseJson(source: string, origin: string): unknown {
  try {
    return JSON.parse(source);
  } catch (err) {
    throw new Error(`${origin} is not valid JSON: ${(err as Error).message}`);
  }
}

function readProvidersFile(filePath: string): unknown {
  const absolutePath = resolve(process.cwd(), filePath);
  let raw: string;
  try {
    raw = readFileSync(absolutePath, 'utf8');
  } catch (err) {
    throw new Error(
      `Unable to read AI providers file "${filePath}" (resolved to ${absolutePath}): ${(err as Error).message}`,
    );
  }
  return parseJson(raw, `AI providers file "${filePath}"`);
}

function resolveApiKey(
  provider: z.infer<typeof aiProviderInputSchema>,
  env: Record<string, unknown>,
): string {
  if (provider.apiKey) {
    return provider.apiKey;
  }

  const envName = provider.apiKeyEnv as string;
  const value = env[envName];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `AI provider "${provider.id}" references env var "${envName}" for its API key, but it is not set. Fail-fast startup.`,
    );
  }
  return value;
}

/**
 * Resolve the AI provider catalog from either an inline JSON override
 * (`AI_PROVIDERS_JSON`, wins) or a catalog file (`AI_PROVIDERS_FILE`).
 * Provider secrets referenced via `apiKeyEnv` are read from `env`.
 *
 * Returns `undefined` when neither source is configured.
 */
export function resolveAiProviders(
  env: Record<string, unknown>,
): AiProviderConfig[] | undefined {
  const jsonOverride = env.AI_PROVIDERS_JSON;
  const filePath = env.AI_PROVIDERS_FILE;

  let source: unknown;
  if (typeof jsonOverride === 'string' && jsonOverride.trim().length > 0) {
    source = parseJson(jsonOverride, 'AI_PROVIDERS_JSON');
  } else if (typeof filePath === 'string' && filePath.trim().length > 0) {
    source = readProvidersFile(filePath);
  } else {
    return undefined;
  }

  const parsed = providersArraySchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid AI provider configuration: ${JSON.stringify(parsed.error.format())}`,
    );
  }

  return parsed.data.map((provider) => ({
    id: provider.id,
    baseURL: provider.baseURL,
    apiKey: resolveApiKey(provider, env),
    models: provider.models,
  }));
}
