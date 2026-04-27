import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { ChannelType } from '@prisma/client';
import { WHATSAPP_ACCOUNT_STATUS_ACTIVE } from '../../channels/whatsapp/whatsapp-account-status';
import { WHATSAPP_GRAPH_API_VERSION } from '../../channels/whatsapp/whatsapp-graph.constants';
import { WhatsappTokenCryptoService } from '../../channels/whatsapp/whatsapp-token-crypto.service';
import { PrismaService } from '../../database/prisma.service';
import { MessagingLoggerService } from '../../infra/messaging-logger.service';
import { CollisionGuardService } from '../../chat/services/collision-guard.service';
import { WhatsappApiAttemptError } from './whatsapp-api-attempt.error';
import {
  WHATSAPP_JOB_IMAGE,
  WHATSAPP_JOB_INTERACTIVE_BUTTONS,
  WHATSAPP_JOB_PRODUCT_LIST,
  WHATSAPP_JOB_TEXT,
  WHATSAPP_JOB_VIDEO,
  WHATSAPP_SEND_QUEUE,
} from './whatsapp-send.constants';
import type {
  WhatsappSendImageJobData,
  WhatsappSendInteractiveButtonsJobData,
  WhatsappSendProductListJobData,
  WhatsappSendTextJobData,
  WhatsappSendVideoJobData,
} from './whatsapp-send.types';

type SendableAccount = {
  id: string;
  tenantId: string;
  metaPhoneNumberId: string;
  accessTokenEncrypted: string;
};

@Injectable()
@Processor(WHATSAPP_SEND_QUEUE, { concurrency: 5 })
export class WhatsappSendProcessor extends WorkerHost {
  private readonly logger = new Logger(WhatsappSendProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenCrypto: WhatsappTokenCryptoService,
    private readonly messagingLog: MessagingLoggerService,
    private readonly collisionGuard: CollisionGuardService,
  ) {
    super();
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error): void {
    const data = job.data as { tenantId?: string };
    this.logger.error(
      JSON.stringify({
        category: 'whatsapp_outbound',
        level: 'error',
        event: 'job_failed',
        tenantId: data?.tenantId,
        jobId: String(job.id),
        jobName: job.name,
        attemptsMade: job.attemptsMade,
        message: error.message,
      }),
    );
  }

  async process(job: Job): Promise<{ ok: true }> {
    if (job.name === WHATSAPP_JOB_TEXT) {
      await this.sendTextWithFallback(job as Job<WhatsappSendTextJobData>);
      return { ok: true };
    }
    if (job.name === WHATSAPP_JOB_IMAGE) {
      await this.sendImageWithFallback(job as Job<WhatsappSendImageJobData>);
      return { ok: true };
    }
    if (job.name === WHATSAPP_JOB_VIDEO) {
      await this.sendVideoWithFallback(job as Job<WhatsappSendVideoJobData>);
      return { ok: true };
    }
    if (job.name === WHATSAPP_JOB_PRODUCT_LIST) {
      await this.sendProductListWithFallback(job as Job<WhatsappSendProductListJobData>);
      return { ok: true };
    }
    if (job.name === WHATSAPP_JOB_INTERACTIVE_BUTTONS) {
      await this.sendInteractiveButtonsWithFallback(
        job as Job<WhatsappSendInteractiveButtonsJobData>,
      );
      return { ok: true };
    }
    throw new UnrecoverableError(`Unknown job name: ${String(job.name)}`);
  }

  private async sendInteractiveButtonsWithFallback(
    job: Job<WhatsappSendInteractiveButtonsJobData>,
  ): Promise<void> {
    const input = job.data;
    const tenantId = await this.resolveTenantId(
      input.whatsappAccountId,
      input.tenantId,
    );

    const conversationId = await this.prisma.conversation
      .findFirst({
        where: {
          tenantId,
          channelType: ChannelType.WHATSAPP,
          externalUserId: input.to,
        },
        select: { id: true },
      })
      .then((r) => r?.id ?? null);

    if (conversationId) {
      const locked = await this.collisionGuard.isConversationLocked(conversationId);
      if (locked) {
        this.logger.warn(
          `Outbound send delayed: conversation locked conversationId=${conversationId} to=${input.to}`,
        );
        throw new Error('Conversation locked (collision guard)');
      }
    }

    const accounts = await this.loadOrderedSendableAccounts(
      tenantId,
      input.whatsappAccountId,
    );
    if (accounts.length === 0) {
      throw new UnrecoverableError(
        `No active WhatsApp numbers for tenant ${tenantId}`,
      );
    }

    let lastRetryable: Error | null = null;
    for (const account of accounts) {
      try {
        await this.postInteractiveButtonsOnce(account, input);
        this.messagingLog.outgoing({
          event: 'interactive_buttons_sent',
          tenantId,
          whatsappAccountId: account.id,
          metaPhoneNumberId: account.metaPhoneNumberId,
          to: input.to,
          jobId: String(job.id),
          usedFallback: account.id !== input.whatsappAccountId,
        });
        return;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (e instanceof UnrecoverableError) {
          this.messagingLog.outgoing({
            event: 'interactive_buttons_attempt_failed',
            tenantId,
            whatsappAccountId: account.id,
            to: input.to,
            jobId: String(job.id),
            fatal: true,
            message: err.message,
          });
          if (err.message.includes('HTTP 400')) {
            throw err;
          }
          continue;
        }
        if (e instanceof WhatsappApiAttemptError) {
          this.messagingLog.outgoing({
            event: 'interactive_buttons_attempt_failed',
            tenantId,
            whatsappAccountId: account.id,
            to: input.to,
            jobId: String(job.id),
            httpStatus: e.httpStatus,
            message: err.message,
          });
          lastRetryable = err;
          continue;
        }
        this.messagingLog.outgoing({
          event: 'interactive_buttons_attempt_failed',
          tenantId,
          whatsappAccountId: account.id,
          to: input.to,
          jobId: String(job.id),
          message: err.message,
        });
        lastRetryable = err;
      }
    }

    if (lastRetryable) throw lastRetryable;
    throw new UnrecoverableError(
      'All WhatsApp numbers failed for this interactive_buttons send (non-retryable)',
    );
  }

  private async sendProductListWithFallback(
    job: Job<WhatsappSendProductListJobData>,
  ): Promise<void> {
    const input = job.data;
    const tenantId = await this.resolveTenantId(
      input.whatsappAccountId,
      input.tenantId,
    );

    const conversationId = await this.prisma.conversation
      .findFirst({
        where: {
          tenantId,
          channelType: ChannelType.WHATSAPP,
          externalUserId: input.to,
        },
        select: { id: true },
      })
      .then((r) => r?.id ?? null);

    if (conversationId) {
      const locked = await this.collisionGuard.isConversationLocked(conversationId);
      if (locked) {
        this.logger.warn(
          `Outbound send delayed: conversation locked conversationId=${conversationId} to=${input.to}`,
        );
        throw new Error('Conversation locked (collision guard)');
      }
    }

    const accounts = await this.loadOrderedSendableAccounts(
      tenantId,
      input.whatsappAccountId,
    );
    if (accounts.length === 0) {
      throw new UnrecoverableError(
        `No active WhatsApp numbers for tenant ${tenantId}`,
      );
    }

    let lastRetryable: Error | null = null;
    for (const account of accounts) {
      try {
        await this.postProductListOnce(account, input);
        this.messagingLog.outgoing({
          event: 'product_list_sent',
          tenantId,
          whatsappAccountId: account.id,
          metaPhoneNumberId: account.metaPhoneNumberId,
          to: input.to,
          jobId: String(job.id),
          usedFallback: account.id !== input.whatsappAccountId,
        });
        return;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (e instanceof UnrecoverableError) {
          this.messagingLog.outgoing({
            event: 'product_list_attempt_failed',
            tenantId,
            whatsappAccountId: account.id,
            to: input.to,
            jobId: String(job.id),
            fatal: true,
            message: err.message,
          });
          if (err.message.includes('HTTP 400')) {
            throw err;
          }
          continue;
        }
        if (e instanceof WhatsappApiAttemptError) {
          this.messagingLog.outgoing({
            event: 'product_list_attempt_failed',
            tenantId,
            whatsappAccountId: account.id,
            to: input.to,
            jobId: String(job.id),
            httpStatus: e.httpStatus,
            message: err.message,
          });
          lastRetryable = err;
          continue;
        }
        this.messagingLog.outgoing({
          event: 'product_list_attempt_failed',
          tenantId,
          whatsappAccountId: account.id,
          to: input.to,
          jobId: String(job.id),
          message: err.message,
        });
        lastRetryable = err;
      }
    }

    if (lastRetryable) throw lastRetryable;
    throw new UnrecoverableError(
      'All WhatsApp numbers failed for this product_list send (non-retryable)',
    );
  }

  private async resolveTenantId(
    preferredAccountId: string,
    explicitTenantId?: string,
  ): Promise<string> {
    if (explicitTenantId?.trim()) {
      return explicitTenantId.trim();
    }
    const row = await this.prisma.whatsappAccount.findFirst({
      where: { id: preferredAccountId },
      select: { tenantId: true },
    });
    if (!row) {
      throw new UnrecoverableError(
        `WhatsApp account not found: ${preferredAccountId}`,
      );
    }
    return row.tenantId;
  }

  private async loadOrderedSendableAccounts(
    tenantId: string,
    preferredAccountId: string,
  ): Promise<SendableAccount[]> {
    const all = await this.prisma.whatsappAccount.findMany({
      where: { tenantId, status: WHATSAPP_ACCOUNT_STATUS_ACTIVE },
      select: {
        id: true,
        tenantId: true,
        metaPhoneNumberId: true,
        accessTokenEncrypted: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    const preferred = all.find((a) => a.id === preferredAccountId);
    const rest = all.filter((a) => a.id !== preferredAccountId);
    return preferred ? [preferred, ...rest] : rest;
  }

  private async sendTextWithFallback(
    job: Job<WhatsappSendTextJobData>,
  ): Promise<void> {
    const input = job.data;

    // لو ده follow-up job، تحقق إن العميل مردش بعد الجدولة
    if (input.followUp) {
      const { conversationId, scheduledAt } = input.followUp;
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { lastMessageAt: true },
      });

      if (conversation?.lastMessageAt) {
        const lastMsg = new Date(conversation.lastMessageAt).getTime();
        const scheduled = new Date(scheduledAt).getTime();

        // لو العميل بعت رسالة بعد ما الـ job اتجدول، متبعتش
        if (lastMsg > scheduled) {
          this.logger.log(
            `Follow-up skipped — customer replied after scheduling. conversation=${conversationId}`,
          );
          return;
        }
      }
    }

    const tenantId = await this.resolveTenantId(
      input.whatsappAccountId,
      input.tenantId,
    );

    const conversationId = await this.prisma.conversation
      .findFirst({
        where: {
          tenantId,
          channelType: ChannelType.WHATSAPP,
          externalUserId: input.to,
        },
        select: { id: true },
      })
      .then((r) => r?.id ?? null);

    if (conversationId) {
      const locked = await this.collisionGuard.isConversationLocked(conversationId);
      if (locked) {
        this.logger.warn(
          `Outbound send delayed: conversation locked conversationId=${conversationId} to=${input.to}`,
        );
        // Let BullMQ retry with backoff; this approximates "send after lock is released".
        throw new Error('Conversation locked (collision guard)');
      }
    }

    const accounts = await this.loadOrderedSendableAccounts(
      tenantId,
      input.whatsappAccountId,
    );
    if (accounts.length === 0) {
      throw new UnrecoverableError(
        `No active WhatsApp numbers for tenant ${tenantId}`,
      );
    }

    let lastRetryable: Error | null = null;

    for (const account of accounts) {
      try {
        await this.postTextOnce(account, input.to, input.message);
        this.messagingLog.outgoing({
          event: 'text_sent',
          tenantId,
          whatsappAccountId: account.id,
          metaPhoneNumberId: account.metaPhoneNumberId,
          to: input.to,
          jobId: String(job.id),
          usedFallback: account.id !== input.whatsappAccountId,
        });
        return;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (e instanceof UnrecoverableError) {
          this.messagingLog.outgoing({
            event: 'text_attempt_failed',
            tenantId,
            whatsappAccountId: account.id,
            to: input.to,
            jobId: String(job.id),
            fatal: true,
            message: err.message,
          });
          if (err.message.includes('HTTP 400')) {
            throw err;
          }
          continue;
        }
        if (e instanceof WhatsappApiAttemptError) {
          this.messagingLog.outgoing({
            event: 'text_attempt_failed',
            tenantId,
            whatsappAccountId: account.id,
            to: input.to,
            jobId: String(job.id),
            httpStatus: e.httpStatus,
            message: err.message,
          });
          lastRetryable = err;
          continue;
        }
        this.messagingLog.outgoing({
          event: 'text_attempt_failed',
          tenantId,
          whatsappAccountId: account.id,
          to: input.to,
          jobId: String(job.id),
          message: err.message,
        });
        lastRetryable = err;
      }
    }

    if (lastRetryable) {
      throw lastRetryable;
    }
    throw new UnrecoverableError(
      'All WhatsApp numbers failed for this send (non-retryable)',
    );
  }

  private async sendImageWithFallback(
    job: Job<WhatsappSendImageJobData>,
  ): Promise<void> {
    const input = job.data;
    const tenantId = await this.resolveTenantId(
      input.whatsappAccountId,
      input.tenantId,
    );

    const conversationId = await this.prisma.conversation
      .findFirst({
        where: {
          tenantId,
          channelType: ChannelType.WHATSAPP,
          externalUserId: input.to,
        },
        select: { id: true },
      })
      .then((r) => r?.id ?? null);

    if (conversationId) {
      const locked = await this.collisionGuard.isConversationLocked(conversationId);
      if (locked) {
        this.logger.warn(
          `Outbound send delayed: conversation locked conversationId=${conversationId} to=${input.to}`,
        );
        throw new Error('Conversation locked (collision guard)');
      }
    }

    const accounts = await this.loadOrderedSendableAccounts(
      tenantId,
      input.whatsappAccountId,
    );
    if (accounts.length === 0) {
      throw new UnrecoverableError(
        `No active WhatsApp numbers for tenant ${tenantId}`,
      );
    }

    let lastRetryable: Error | null = null;

    for (const account of accounts) {
      try {
        await this.postImageOnce(account, input);
        this.messagingLog.outgoing({
          event: 'image_sent',
          tenantId,
          whatsappAccountId: account.id,
          metaPhoneNumberId: account.metaPhoneNumberId,
          to: input.to,
          jobId: String(job.id),
          usedFallback: account.id !== input.whatsappAccountId,
        });
        return;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (e instanceof UnrecoverableError) {
          this.messagingLog.outgoing({
            event: 'image_attempt_failed',
            tenantId,
            whatsappAccountId: account.id,
            to: input.to,
            jobId: String(job.id),
            fatal: true,
            message: err.message,
          });
          if (err.message.includes('HTTP 400')) {
            throw err;
          }
          continue;
        }
        if (e instanceof WhatsappApiAttemptError) {
          this.messagingLog.outgoing({
            event: 'image_attempt_failed',
            tenantId,
            whatsappAccountId: account.id,
            to: input.to,
            jobId: String(job.id),
            httpStatus: e.httpStatus,
            message: err.message,
          });
          lastRetryable = err;
          continue;
        }
        this.messagingLog.outgoing({
          event: 'image_attempt_failed',
          tenantId,
          whatsappAccountId: account.id,
          to: input.to,
          jobId: String(job.id),
          message: err.message,
        });
        lastRetryable = err;
      }
    }

    if (lastRetryable) {
      throw lastRetryable;
    }
    throw new UnrecoverableError(
      'All WhatsApp numbers failed for this image send (non-retryable)',
    );
  }

  private async sendVideoWithFallback(
    job: Job<WhatsappSendVideoJobData>,
  ): Promise<void> {
    const input = job.data;
    const tenantId = await this.resolveTenantId(
      input.whatsappAccountId,
      input.tenantId,
    );

    const conversationId = await this.prisma.conversation
      .findFirst({
        where: {
          tenantId,
          channelType: ChannelType.WHATSAPP,
          externalUserId: input.to,
        },
        select: { id: true },
      })
      .then((r) => r?.id ?? null);

    if (conversationId) {
      const locked = await this.collisionGuard.isConversationLocked(conversationId);
      if (locked) {
        this.logger.warn(
          `Outbound send delayed: conversation locked conversationId=${conversationId} to=${input.to}`,
        );
        throw new Error('Conversation locked (collision guard)');
      }
    }

    const accounts = await this.loadOrderedSendableAccounts(
      tenantId,
      input.whatsappAccountId,
    );
    if (accounts.length === 0) {
      throw new UnrecoverableError(
        `No active WhatsApp numbers for tenant ${tenantId}`,
      );
    }

    let lastRetryable: Error | null = null;

    for (const account of accounts) {
      try {
        await this.postVideoOnce(account, input);
        this.messagingLog.outgoing({
          event: 'video_sent',
          tenantId,
          whatsappAccountId: account.id,
          metaPhoneNumberId: account.metaPhoneNumberId,
          to: input.to,
          jobId: String(job.id),
          usedFallback: account.id !== input.whatsappAccountId,
        });
        return;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (e instanceof UnrecoverableError) {
          this.messagingLog.outgoing({
            event: 'video_attempt_failed',
            tenantId,
            whatsappAccountId: account.id,
            to: input.to,
            jobId: String(job.id),
            fatal: true,
            message: err.message,
          });
          if (err.message.includes('HTTP 400')) {
            throw err;
          }
          continue;
        }
        if (e instanceof WhatsappApiAttemptError) {
          this.messagingLog.outgoing({
            event: 'video_attempt_failed',
            tenantId,
            whatsappAccountId: account.id,
            to: input.to,
            jobId: String(job.id),
            httpStatus: e.httpStatus,
            message: err.message,
          });
          lastRetryable = err;
          continue;
        }
        this.messagingLog.outgoing({
          event: 'video_attempt_failed',
          tenantId,
          whatsappAccountId: account.id,
          to: input.to,
          jobId: String(job.id),
          message: err.message,
        });
        lastRetryable = err;
      }
    }

    if (lastRetryable) {
      throw lastRetryable;
    }
    throw new UnrecoverableError(
      'All WhatsApp numbers failed for this video send (non-retryable)',
    );
  }

  private async postTextOnce(
    account: SendableAccount,
    to: string,
    message: string,
  ): Promise<void> {
    let token: string;
    try {
      token = this.tokenCrypto.decrypt(account.accessTokenEncrypted);
    } catch (e) {
      throw new UnrecoverableError(
        `Failed to decrypt WhatsApp access token: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${account.metaPhoneNumberId}/messages`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
      }),
    });

    const responseText = await res.text();
    this.classifyResponse(res.status, responseText);
  }

  private async postImageOnce(
    account: SendableAccount,
    input: WhatsappSendImageJobData,
  ): Promise<void> {
    let token: string;
    try {
      token = this.tokenCrypto.decrypt(account.accessTokenEncrypted);
    } catch (e) {
      throw new UnrecoverableError(
        `Failed to decrypt WhatsApp access token: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${account.metaPhoneNumberId}/messages`;

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: input.to,
      type: 'image',
      image: {
        link: input.imageUrl,
        ...(input.caption ? { caption: input.caption } : {}),
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    this.classifyResponse(res.status, responseText);
  }

  private async postVideoOnce(
    account: SendableAccount,
    input: WhatsappSendVideoJobData,
  ): Promise<void> {
    let token: string;
    try {
      token = this.tokenCrypto.decrypt(account.accessTokenEncrypted);
    } catch (e) {
      throw new UnrecoverableError(
        `Failed to decrypt WhatsApp access token: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${account.metaPhoneNumberId}/messages`;

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: input.to,
      type: 'video',
      video: {
        link: input.videoUrl,
        ...(input.caption ? { caption: input.caption } : {}),
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    this.classifyResponse(res.status, responseText);
  }

  private async postProductListOnce(
    account: SendableAccount,
    input: WhatsappSendProductListJobData,
  ): Promise<void> {
    let token: string;
    try {
      token = this.tokenCrypto.decrypt(account.accessTokenEncrypted);
    } catch (e) {
      throw new UnrecoverableError(
        `Failed to decrypt WhatsApp access token: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${account.metaPhoneNumberId}/messages`;

    const headerText = (input.headerText ?? '').trim();
    const bodyText = (input.bodyText ?? '').trim();
    const items = (input.productRetailerIds ?? [])
      .map((id) => (id ?? '').toString().trim())
      .filter(Boolean)
      .slice(0, 30);

    if (!input.catalogId?.trim()) {
      throw new UnrecoverableError('Missing WhatsApp catalog_id for product_list');
    }
    if (items.length === 0) {
      throw new UnrecoverableError('No product items for product_list');
    }

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: 'interactive',
      interactive: {
        type: 'product_list',
        ...(headerText
          ? { header: { type: 'text', text: headerText } }
          : {}),
        ...(bodyText ? { body: { text: bodyText } } : {}),
        action: {
          catalog_id: input.catalogId.trim(),
          sections: [
            {
              title: 'Products',
              product_items: items.map((id) => ({
                product_retailer_id: id,
              })),
            },
          ],
        },
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    this.classifyResponse(res.status, responseText);
  }

  private async postInteractiveButtonsOnce(
    account: SendableAccount,
    input: WhatsappSendInteractiveButtonsJobData,
  ): Promise<void> {
    let token: string;
    try {
      token = this.tokenCrypto.decrypt(account.accessTokenEncrypted);
    } catch (e) {
      throw new UnrecoverableError(
        `Failed to decrypt WhatsApp access token: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${account.metaPhoneNumberId}/messages`;

    const buttons = (input.buttons ?? []).slice(0, 3).map((b) => ({
      type: 'reply',
      reply: { id: String(b.id), title: String(b.title) },
    }));

    if (buttons.length === 0) {
      throw new UnrecoverableError('No buttons for interactive button message');
    }

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: input.bodyText },
        action: { buttons },
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    this.classifyResponse(res.status, responseText);
  }

  /**
   * Success: return. Otherwise throws {@link UnrecoverableError} or {@link WhatsappApiAttemptError} or generic Error.
   */
  private classifyResponse(status: number, body: string): void {
    if (status >= 200 && status < 300) {
      return;
    }
    const snippet = body.length > 500 ? `${body.slice(0, 500)}…` : body;
    if (status === 400) {
      throw new UnrecoverableError(`WhatsApp Cloud API HTTP 400 — ${snippet}`);
    }
    if (status >= 400 && status < 500) {
      throw new WhatsappApiAttemptError(
        `WhatsApp Cloud API HTTP ${status} — ${snippet}`,
        status,
      );
    }
    if (status >= 500) {
      throw new WhatsappApiAttemptError(
        `WhatsApp Cloud API HTTP ${status} — ${snippet}`,
        status,
      );
    }
    throw new UnrecoverableError(`WhatsApp Cloud API HTTP ${status} — ${snippet}`);
  }
}
