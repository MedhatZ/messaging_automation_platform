import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Product } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MessagingLoggerService } from '../../infra/messaging-logger.service';
import { TenantRateLimitService } from '../../infra/tenant-rate-limit.service';
import { WhatsappSendProducer } from '../../queues/whatsapp-send/whatsapp-send.producer';
import type {
  WhatsappSendImageJobData,
  WhatsappSendJobStatus,
  WhatsappSendProductListJobData,
  WhatsappSendTextJobData,
  WhatsappSendInteractiveButtonsJobData,
  WhatsappSendVideoJobData,
} from '../../queues/whatsapp-send/whatsapp-send.types';
import { WHATSAPP_ACCOUNT_STATUS_ACTIVE } from './whatsapp-account-status';

/** Public API: tenantId optional (resolved from the WhatsApp account row). */
export type SendTextMessageInput = Omit<WhatsappSendTextJobData, 'tenantId'> & {
  tenantId?: string;
};
export type SendImageMessageInput = Omit<WhatsappSendImageJobData, 'tenantId'> & {
  tenantId?: string;
};
export type SendVideoMessageInput = Omit<WhatsappSendVideoJobData, 'tenantId'> & {
  tenantId?: string;
};
export type SendProductCarouselInput = Omit<
  WhatsappSendProductListJobData,
  'tenantId' | 'catalogId' | 'productRetailerIds'
> & {
  tenantId?: string;
  products: Product[];
  headerText?: string;
  bodyText?: string;
};

export type SendInteractiveButtonsInput = Omit<
  WhatsappSendInteractiveButtonsJobData,
  'tenantId'
> & {
  tenantId?: string;
  delayMs?: number;
};

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sendProducer: WhatsappSendProducer,
    private readonly rateLimit: TenantRateLimitService,
    private readonly messagingLog: MessagingLoggerService,
    private readonly config: ConfigService,
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

  async sendVideoMessage(input: SendVideoMessageInput): Promise<void> {
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
        event: 'video_enqueue_blocked',
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
        to: input.to,
        reason: 'rate_limit',
      });
      return;
    }

    try {
      const jobId = await this.sendProducer.enqueueVideo({
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
        to: input.to,
        videoUrl: input.videoUrl,
        caption: input.caption,
      });
      this.messagingLog.outgoing({
        event: 'video_queued',
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
        to: input.to,
        jobId,
      });
    } catch (err) {
      this.logger.error(
        'Failed to enqueue WhatsApp video message',
        err instanceof Error ? err.stack : String(err),
      );
      this.messagingLog.outgoing({
        event: 'video_enqueue_error',
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

  /**
   * Queues an outbound interactive product list (catalog-based).
   * NOTE: `product_retailer_id` must match the product's retailer id in Meta catalog.
   * This implementation uses your DB product `id` as retailer id by default.
   */
  async sendProductCarousel(input: SendProductCarouselInput): Promise<void> {
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
        event: 'product_list_enqueue_blocked',
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
        to: input.to,
        reason: 'rate_limit',
      });
      return;
    }

    const catalogId =
      this.config.get<string>('whatsapp.catalogId', { infer: true }) ?? '';
    const productRetailerIds = (input.products ?? [])
      .map((p) => (p?.id ?? '').toString().trim())
      .filter(Boolean)
      .slice(0, 30);

    if (!catalogId.trim()) {
      this.logger.error('WHATSAPP_CATALOG_ID is not configured');
      return;
    }
    if (productRetailerIds.length === 0) {
      this.logger.warn('sendProductCarousel called with zero products');
      return;
    }

    try {
      const jobId = await this.sendProducer.enqueueProductList({
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
        to: input.to,
        catalogId: catalogId.trim(),
        headerText: input.headerText,
        bodyText: input.bodyText,
        productRetailerIds,
      });
      this.messagingLog.outgoing({
        event: 'product_list_queued',
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
        to: input.to,
        jobId,
        items: productRetailerIds.length,
      });
    } catch (err) {
      this.logger.error(
        'Failed to enqueue WhatsApp product list message',
        err instanceof Error ? err.stack : String(err),
      );
      this.messagingLog.outgoing({
        event: 'product_list_enqueue_error',
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
        to: input.to,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async sendInteractiveButtons(input: SendInteractiveButtonsInput): Promise<void> {
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
        event: 'interactive_buttons_enqueue_blocked',
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
        to: input.to,
        reason: 'rate_limit',
      });
      return;
    }

    try {
      const jobId = await this.sendProducer.enqueueInteractiveButtons(
        {
          tenantId,
          whatsappAccountId: input.whatsappAccountId,
          to: input.to,
          bodyText: input.bodyText,
          buttons: input.buttons,
        },
        { delayMs: input.delayMs },
      );
      this.messagingLog.outgoing({
        event: 'interactive_buttons_queued',
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
        to: input.to,
        jobId,
        buttons: input.buttons?.length ?? 0,
      });
    } catch (err) {
      this.logger.error(
        'Failed to enqueue WhatsApp interactive buttons message',
        err instanceof Error ? err.stack : String(err),
      );
      this.messagingLog.outgoing({
        event: 'interactive_buttons_enqueue_error',
        tenantId,
        whatsappAccountId: input.whatsappAccountId,
        to: input.to,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
