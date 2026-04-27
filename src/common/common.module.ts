import { Global, Module } from '@nestjs/common';
import { ConversationGateway } from '../gateways/conversation.gateway';
import { CollisionGuardService } from '../chat/services/collision-guard.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../database/prisma.module';

/**
 * Shared utilities, guards, interceptors, and DTOs can live under `common/` and be wired here.
 */
@Global()
@Module({
  imports: [AuthModule, PrismaModule],
  providers: [ConversationGateway, CollisionGuardService],
  exports: [ConversationGateway, CollisionGuardService],
})
export class CommonModule {}
