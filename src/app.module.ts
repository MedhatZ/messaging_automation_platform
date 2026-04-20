import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CacheModule } from './cache/cache.module';
import { AppConfigModule } from './config/app-config.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChannelsModule } from './channels/channels.module';
import { ChatModule } from './chat/chat.module';
import { ConversationsModule } from './conversations/conversations.module';
import { CommonModule } from './common/common.module';
import { CoreModule } from './core/core.module';
import { PrismaModule } from './database/prisma.module';
import { FaqModule } from './faq/faq.module';
import { InfraModule } from './infra/infra.module';
import { LeadsModule } from './leads/leads.module';
import { ProductsModule } from './products/products.module';
import { TenantsModule } from './tenants/tenants.module';
import { UploadModule } from './upload/upload.module';
import { WhatsappAccountsModule } from './whatsapp-accounts/whatsapp-accounts.module';

@Module({
  imports: [
    AppConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('redis.url')?.trim();
        if (!url) {
          throw new Error(
            'REDIS_URL is required for BullMQ (WhatsApp outbound queue).',
          );
        }
        return {
          connection: { url },
        };
      },
      inject: [ConfigService],
    }),
    CacheModule,
    InfraModule,
    CoreModule,
    CommonModule,
    PrismaModule,
    AuthModule,
    AdminModule,
    TenantsModule,
    ChannelsModule,
    ChatModule,
    ProductsModule,
    UploadModule,
    FaqModule,
    LeadsModule,
    ConversationsModule,
    WhatsappAccountsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
