import { Module } from '@nestjs/common';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { ConversationModule } from '../conversation/conversation.module.js';
import { RedisModule } from '../../redis/redis.module.js';
import { LLM_PROVIDER } from './interfaces/provider.interface.js';
import { OpenAiCompatibleProvider } from './providers/openai-compatible.provider.js';

@Module({
  imports: [ConversationModule, RedisModule],
  controllers: [AiController],
  providers: [
    AiService,
    {
      provide: LLM_PROVIDER,
      useClass: OpenAiCompatibleProvider,
    },
  ],
  exports: [AiService, LLM_PROVIDER],
})
export class AiModule {}
