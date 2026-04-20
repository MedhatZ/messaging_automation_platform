import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatController } from './chat.controller';
import { ChatEngineService } from './chat-engine.service';
import { ChatService } from './chat.service';
import { ChatAiDecisionService } from './decision-engine/ai.service';
import { ChatFaqDecisionService } from './decision-engine/faq.service';
import { ChatOrderDecisionService } from './decision-engine/order.service';
import { ChatProductDecisionService } from './decision-engine/product.service';

@Module({
  imports: [AuthModule],
  controllers: [ChatController],
  providers: [
    ChatEngineService,
    ChatFaqDecisionService,
    ChatProductDecisionService,
    ChatOrderDecisionService,
    ChatAiDecisionService,
    ChatService,
  ],
  exports: [ChatEngineService, ChatService],
})
export class ChatModule {}
