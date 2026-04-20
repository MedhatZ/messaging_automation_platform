import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { WhatsappCryptoModule } from '../../channels/whatsapp/whatsapp-crypto.module';
import {
  WHATSAPP_SEND_ATTEMPTS,
  WHATSAPP_SEND_BACKOFF_MS,
  WHATSAPP_SEND_QUEUE,
} from './whatsapp-send.constants';
import { WhatsappSendProcessor } from './whatsapp-send.processor';
import { WhatsappSendProducer } from './whatsapp-send.producer';

@Module({
  imports: [
    WhatsappCryptoModule,
    BullModule.registerQueue({
      name: WHATSAPP_SEND_QUEUE,
      defaultJobOptions: {
        attempts: WHATSAPP_SEND_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: WHATSAPP_SEND_BACKOFF_MS,
        },
        removeOnComplete: { count: 5000 },
        removeOnFail: { count: 10000 },
      },
    }),
  ],
  providers: [WhatsappSendProducer, WhatsappSendProcessor],
  exports: [WhatsappSendProducer],
})
export class WhatsappSendQueueModule {}
