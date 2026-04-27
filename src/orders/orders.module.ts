import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsappSendQueueModule } from '../queues/whatsapp-send/whatsapp-send.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule, WhatsappSendQueueModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}

