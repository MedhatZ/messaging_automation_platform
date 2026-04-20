import { Module } from '@nestjs/common';
import { WhatsappTokenCryptoService } from './whatsapp-token-crypto.service';

@Module({
  providers: [WhatsappTokenCryptoService],
  exports: [WhatsappTokenCryptoService],
})
export class WhatsappCryptoModule {}
