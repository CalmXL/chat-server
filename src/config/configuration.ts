export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'chat_server',
    synchronize: process.env.DATABASE_SYNCHRONIZE !== 'false',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  jwt: {
    accessSecret:
      process.env.JWT_ACCESS_SECRET ||
      'chat-server-jwt-access-secret-key-min-32-chars-long!',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ||
      'chat-server-jwt-refresh-secret-key-min-32-chars-long!',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  ai: {
    providers: (() => {
      if (process.env.AI_PROVIDERS_JSON) {
        try {
          return JSON.parse(process.env.AI_PROVIDERS_JSON);
        } catch {
          return [];
        }
      }
      return [
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
    })(),
    maxConcurrentStreams: parseInt(
      process.env.AI_MAX_CONCURRENT_STREAMS || '3',
      10,
    ),
    rateLimitRpm: parseInt(process.env.AI_RATE_LIMIT_RPM || '20', 10),
    maxUploadMb: parseInt(process.env.AI_MAX_UPLOAD_MB || '10', 10),
    historyWindow: parseInt(process.env.AI_HISTORY_WINDOW || '20', 10),
    docTruncateChars: parseInt(process.env.AI_DOC_TRUNCATE_CHARS || '2000', 10),
    uploadDir: process.env.UPLOAD_DIR || './uploads',
    systemPrompt: process.env.AI_SYSTEM_PROMPT || undefined,
  },
});
