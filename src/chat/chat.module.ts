import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatController } from './chat.controller';
import { ChatEngineService } from './chat-engine.service';
import { ChatService } from './chat.service';
import { ChatAiDecisionService } from './decision-engine/ai.service';
import { ChatFaqDecisionService } from './decision-engine/faq.service';
import { ChatOrderDecisionService } from './decision-engine/order.service';
import { ChatProductDecisionService } from './decision-engine/product.service';
import { ConversationMemoryService } from './services/conversation-memory.service';
import { EmbeddingsService } from './services/embeddings.service';
import { ProductsModule } from '../products/products.module';
import { CollisionGuardService } from './services/collision-guard.service';
import { FollowUpService } from './services/follow-up.service';
import { WhatsappSendQueueModule } from '../queues/whatsapp-send/whatsapp-send.module';
import { LeadClassifierService } from './services/lead-classifier.service';

@Module({
  imports: [AuthModule, ProductsModule, WhatsappSendQueueModule],
  controllers: [ChatController],
  providers: [
    ChatEngineService,
    ChatFaqDecisionService,
    ChatProductDecisionService,
    ChatOrderDecisionService,
    ChatAiDecisionService,
    EmbeddingsService,
    ConversationMemoryService,
    CollisionGuardService,
    FollowUpService,
    LeadClassifierService,
    ChatService,
  ],
  exports: [
    ChatEngineService,
    ChatService,
    ConversationMemoryService,
    CollisionGuardService,
  ],
})
export class ChatModule {}
