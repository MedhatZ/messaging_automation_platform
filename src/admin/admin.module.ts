import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsappCryptoModule } from '../channels/whatsapp/whatsapp-crypto.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, WhatsappCryptoModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
