import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from '../../auth/auth.module';
import { ChatModule } from '../../chat/chat.module';
import { BaileysController } from './baileys.controller';
import { BaileysMessageHandler } from './baileys-message.handler';
import { BaileysService } from './baileys.service';

@Module({
  imports: [EventEmitterModule.forRoot(), ChatModule, AuthModule],
  providers: [BaileysService, BaileysMessageHandler],
  controllers: [BaileysController],
  exports: [BaileysService],
})
export class BaileysModule {}

