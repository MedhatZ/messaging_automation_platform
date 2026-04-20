import { Injectable, Logger } from '@nestjs/common';

/**
 * Structured audit logs for webhooks and outbound WhatsApp traffic.
 * Logs JSON lines suitable for log aggregation (tenantId always when known).
 */
@Injectable()
export class MessagingLoggerService {
  private readonly logger = new Logger(MessagingLoggerService.name);

  webhookEvent(payload: Record<string, unknown>): void {
    this.logger.log(
      JSON.stringify({ category: 'whatsapp_webhook', ...payload }),
    );
  }

  outgoing(payload: Record<string, unknown>): void {
    this.logger.log(
      JSON.stringify({ category: 'whatsapp_outbound', ...payload }),
    );
  }

  webhookWarn(message: string, payload?: Record<string, unknown>): void {
    this.logger.warn(
      JSON.stringify({
        category: 'whatsapp_webhook',
        level: 'warn',
        message,
        ...payload,
      }),
    );
  }
}
