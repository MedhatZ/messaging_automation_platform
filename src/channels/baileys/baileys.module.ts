import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ChatModule } from '../../chat/chat.module';
import { BaileysController } from './baileys.controller';
import { BaileysMessageHandler } from './baileys-message.handler';
import { BaileysService } from './baileys.service';

@Module({
  imports: [EventEmitterModule.forRoot(), ChatModule],
  providers: [BaileysService, BaileysMessageHandler],
  controllers: [BaileysController],
  exports: [BaileysService],
})
export class BaileysModule {}

