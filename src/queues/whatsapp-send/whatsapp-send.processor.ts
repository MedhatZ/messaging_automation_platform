import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { WHATSAPP_ACCOUNT_STATUS_ACTIVE } from '../../channels/whatsapp/whatsapp-account-status';
import { WHATSAPP_GRAPH_API_VERSION } from '../../channels/whatsapp/whatsapp-graph.constants';
import { WhatsappTokenCryptoService } from '../../channels/whatsapp/whatsapp-token-crypto.service';
import { PrismaService } from '../../database/prisma.service';
import { MessagingLoggerService } from '../../infra/messaging-logger.service';
import { WhatsappApiAttemptError } from './whatsapp-api-attempt.error';
import {
  WHATSAPP_JOB_IMAGE,
  WHATSAPP_JOB_TEXT,
  WHATSAPP_SEND_QUEUE,
} from './whatsapp-send.constants';
import type {
  WhatsappSendImageJobData,
  WhatsappSendTextJobData,
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
    throw new UnrecoverableError(`Unknown job name: ${String(job.name)}`);
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
    const tenantId = await this.resolveTenantId(
      input.whatsappAccountId,
      input.tenantId,
    );
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
