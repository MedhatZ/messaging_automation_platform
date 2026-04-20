import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsappCryptoModule } from '../channels/whatsapp/whatsapp-crypto.module';
import { WhatsappAccountsController } from './whatsapp-accounts.controller';
import { WhatsappAccountsService } from './whatsapp-accounts.service';

@Module({
  imports: [AuthModule, WhatsappCryptoModule],
  controllers: [WhatsappAccountsController],
  providers: [WhatsappAccountsService],
})
export class WhatsappAccountsModule {}
