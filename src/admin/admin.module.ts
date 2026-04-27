import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsappCryptoModule } from '../channels/whatsapp/whatsapp-crypto.module';
import { PrismaModule } from '../database/prisma.module';
import { AdminController } from './admin.controller';
import { AdminMemoryController } from './admin-memory.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, WhatsappCryptoModule, PrismaModule],
  controllers: [AdminController, AdminMemoryController],
  providers: [AdminService],
})
export class AdminModule {}
