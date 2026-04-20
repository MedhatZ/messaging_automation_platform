import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MessagingLoggerService } from '../../infra/messaging-logger.service';
import { TenantRateLimitService } from '../../infra/tenant-rate-limit.service';
import { WhatsappSendProducer } from '../../queues/whatsapp-send/whatsapp-send.producer';
import type {
  WhatsappSendImageJobData,
  WhatsappSendJobStatus,
  WhatsappSendTextJobData,
} from '../../queues/whatsapp-send/whatsapp-send.types';
import { WHATSAPP_ACCOUNT_STATUS_ACTIVE } from './whatsapp-account-status';

/** Public API: tenantId optional (resolved from the WhatsApp account row). */
export type SendTextMessageInput = Omit<WhatsappSendTextJobData, 'tenantId'> & {
  tenantId?: string;
};
export type SendImageMessageInput = Omit<WhatsappSendImageJobData, 'tenantId'> & {
  tenantId?: string;
};

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sendProducer: WhatsappSendProducer,
    private readonly rateLimit: TenantRateLimitService,
    private readonly messagingLog: MessagingLoggerService,
  ) {}

  private async resolveTenantForSend(
    whatsappAccountId: string,
    claimedTenantId?: string,
  ): Promise<string | null> {
    const row = await this.prisma.whatsappAccount.findFirst({
      where: {
        id: whatsappAccountId,
        status: WHATSAPP_ACCOUNT_STATUS_ACTIVE,
      },
      select: { tenantId: true },
    });
    if (!row) {
      return null;
    }
    if (
      claimedTenantId &&
      claimedTenantId.trim() &&
      claimedTenantId.trim() !== row.tenantId
    ) {
      this.logger.warn(
        `WhatsApp send: tenantId claim does not match account tenant for account=${whatsappAccountId}`,
      );
    }
    return row.tenantId;
  }

  /**
   * Queues an outbound text message; Meta API is called by the BullMQ worker
   * (with per-tenant multi-number fallback there).
   */
  async sendTextMessage(input: SendTextMessageInput): Promise<void> {
    const tenantId = await this.resolveTenantForSend(
      input.whatsappAccountId,
      input.tenantId,
    );
    if (!tenantId) {
      this.logger.warn(
        `WhatsApp account not found or inactive: ${input.whatsappAccountId}`,
      );
      return;
    }

    const allowed = await this.rateLimit.tryConsume(tenantId, 'outbound');
    if (!allowed) {
      this.messagingLog.outgoing({
        event: 'text_enqueue_blocked',
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
        to: input.to,
        reason: 'rate_limit',
      });
      return;
    }

    try {
      const jobId = await this.sendProducer.enqueueText({
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
        to: input.to,
        message: input.message,
      });
      this.messagingLog.outgoing({
        event: 'text_queued',
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
        to: input.to,
        jobId,
      });
    } catch (err) {
      this.logger.error(
        'Failed to enqueue WhatsApp text message',
        err instanceof Error ? err.stack : String(err),
      );
      this.messagingLog.outgoing({
        event: 'text_enqueue_error',
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
        to: input.to,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async sendImageMessage(input: SendImageMessageInput): Promise<void> {
    const tenantId = await this.resolveTenantForSend(
      input.whatsappAccountId,
      input.tenantId,
    );
    if (!tenantId) {
      this.logger.warn(
        `WhatsApp account not found or inactive: ${input.whatsappAccountId}`,
      );
      return;
    }

    const allowed = await this.rateLimit.tryConsume(tenantId, 'outbound');
    if (!allowed) {
      this.messagingLog.outgoing({
        event: 'image_enqueue_blocked',
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
        to: input.to,
        reason: 'rate_limit',
      });
      return;
    }

    try {
      const jobId = await this.sendProducer.enqueueImage({
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
        to: input.to,
        imageUrl: input.imageUrl,
        caption: input.caption,
      });
      this.messagingLog.outgoing({
        event: 'image_queued',
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
        to: input.to,
        jobId,
      });
    } catch (err) {
      this.logger.error(
        'Failed to enqueue WhatsApp image message',
        err instanceof Error ? err.stack : String(err),
      );
      this.messagingLog.outgoing({
        event: 'image_enqueue_error',
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
        to: input.to,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async getSendJobStatus(jobId: string): Promise<WhatsappSendJobStatus | null> {
    return this.sendProducer.getJobStatus(jobId);
  }
}
