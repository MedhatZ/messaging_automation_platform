import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsappSendQueueModule } from '../queues/whatsapp-send/whatsapp-send.module';
import { BroadcastController } from './broadcast.controller';
import { BroadcastService } from './broadcast.service';

@Module({
  imports: [AuthModule, WhatsappSendQueueModule],
  controllers: [BroadcastController],
  providers: [BroadcastService],
})
export class BroadcastModule {}

