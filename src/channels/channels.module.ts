import { Module } from '@nestjs/common';
import { CommentsModule } from './comments/comments.module';
import { MessengerModule } from './messenger/messenger.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [WhatsappModule, MessengerModule, CommentsModule],
  exports: [WhatsappModule, MessengerModule, CommentsModule],
})
export class ChannelsModule {}
