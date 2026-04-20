import { Module } from '@nestjs/common';
import { ChatModule } from '../../chat/chat.module';
import { WhatsappSendQueueModule } from '../../queues/whatsapp-send/whatsapp-send.module';
import { WhatsappCryptoModule } from './whatsapp-crypto.module';
import { MetaWebhookSignatureGuard } from './guards/meta-webhook-signature.guard';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappWebhookService } from './whatsapp-webhook.service';

@Module({
  imports: [
    WhatsappCryptoModule,
    WhatsappSendQueueModule,
    ChatModule,
  ],
  controllers: [WhatsappController],
  providers: [
    WhatsappWebhookService,
    WhatsappService,
    MetaWebhookSignatureGuard,
  ],
  exports: [WhatsappService, WhatsappCryptoModule],
})
export class WhatsappModule {}
