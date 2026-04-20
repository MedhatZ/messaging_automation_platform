import { Global, Module } from '@nestjs/common';
import { MessagingLoggerService } from './messaging-logger.service';
import { TenantRateLimitService } from './tenant-rate-limit.service';

@Global()
@Module({
  providers: [MessagingLoggerService, TenantRateLimitService],
  exports: [MessagingLoggerService, TenantRateLimitService],
})
export class InfraModule {}
