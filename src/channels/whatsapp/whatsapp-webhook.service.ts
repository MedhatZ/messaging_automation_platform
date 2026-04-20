import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelType } from '@prisma/client';
import type { WhatsappAccount } from '@prisma/client';
import { CacheService } from '../../cache/cache.service';
import { ChatService } from '../../chat/chat.service';
import { PrismaService } from '../../database/prisma.service';
import { MessagingLoggerService } from '../../infra/messaging-logger.service';
import { TenantRateLimitService } from '../../infra/tenant-rate-limit.service';
import {
  parseWhatsappAccountFromCache,
  serializeWhatsappAccountForCache,
  whatsappPhoneCacheKey,
  WHATSAPP_PHONE_CACHE_TTL_SEC,
} from './whatsapp-account-cache';
import {
  isWhatsappAccountActiveForOps,
  WHATSAPP_ACCOUNT_STATUS_ACTIVE,
} from './whatsapp-account-status';
import { WhatsappService } from './whatsapp.service';

type WaIncomingText = {
  from?: string;
  type?: string;
  text?: { body?: string };
};

type WaContact = {
  wa_id?: string;
  profile?: { name?: string };
};

type WaMetadata = {
  phone_number_id?: string;
  display_phone_number?: string;
};

type WaChangeValue = {
  metadata?: WaMetadata;
  messages?: WaIncomingText[];
  contacts?: WaContact[];
};

type WaChange = {
  field?: string;
  value?: WaChangeValue;
};

type WaEntry = {
  id?: string;
  changes?: WaChange[];
};

type WaWebhookBody = {
  object?: string;
  entry?: WaEntry[];
};

type ResolvedWhatsappAccount = Pick<
  WhatsappAccount,
  'id' | 'tenantId' | 'metaPhoneNumberId' | 'status'
>;

@Injectable()
export class WhatsappWebhookService {
  private readonly logger = new Logger(WhatsappWebhookService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly whatsapp: WhatsappService,
    private readonly cache: CacheService,
    private readonly rateLimit: TenantRateLimitService,
    private readonly messagingLog: MessagingLoggerService,
  ) {}

  async verifySubscription(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): Promise<string | null> {
    const receivedToken = typeof token === 'string' ? token.trim() : '';
    if (mode !== 'subscribe' || !challenge) {
      this.logger.warn(
        `WhatsApp webhook verify rejected: mode=${String(mode)} challengePresent=${Boolean(challenge)}`,
      );
      return null;
    }

    const defaultToken = this.config
      .get<string>('whatsapp.defaultVerifyToken', { infer: true })
      ?.trim();
    if (defaultToken && receivedToken === defaultToken) {
      return challenge;
    }

    const byAccount = await this.prisma.whatsappAccount.findFirst({
      where: {
        verifyToken: receivedToken,
        status: WHATSAPP_ACCOUNT_STATUS_ACTIVE,
      },
      select: { id: true },
    });
    if (byAccount) {
      return challenge;
    }

    this.logger.warn(
      'WhatsApp webhook verify_token did not match DEFAULT_VERIFY_TOKEN or any WhatsappAccount.verifyToken',
    );
    return null;
  }

  async handleWebhookPayload(body: unknown): Promise<void> {
    const parsed = body as WaWebhookBody;
    if (
      parsed?.object !== 'whatsapp_business_account' ||
      !Array.isArray(parsed.entry)
    ) {
      this.messagingLog.webhookEvent({
        event: 'ignored_shape',
        reason: 'unknown_object_or_entry',
      });
      this.logger.debug('Ignoring webhook: unknown object or shape');
      return;
    }

    this.messagingLog.webhookEvent({
      event: 'payload_received',
      entryCount: parsed.entry.length,
    });

    for (const entry of parsed.entry) {
      if (!Array.isArray(entry?.changes)) continue;
      for (const change of entry.changes) {
        if (change?.field && change.field !== 'messages') continue;
        const value = change?.value;
        if (!value || !Array.isArray(value.messages)) continue;

        const phoneNumberId = value.metadata?.phone_number_id?.trim();
        if (!phoneNumberId) {
          this.logger.warn(
            'WhatsApp webhook: missing value.metadata.phone_number_id; cannot route tenant',
          );
          continue;
        }

        const account = await this.resolveAccountByPhoneNumberId(phoneNumberId);
        if (!account || !isWhatsappAccountActiveForOps(account.status)) {
          this.messagingLog.webhookWarn(
            'no_active_account_for_phone_number_id',
            {
              phoneNumberId,
              resolvedStatus: account?.status,
            },
          );
          this.logger.warn(
            `WhatsApp webhook: no active WhatsappAccount for phone_number_id=${phoneNumberId}`,
          );
          continue;
        }

        this.messagingLog.webhookEvent({
          event: 'tenant_routed',
          tenantId: account.tenantId,
          whatsappAccountId: account.id,
          phoneNumberId,
        });

        const contacts = Array.isArray(value.contacts) ? value.contacts : [];
        for (const msg of value.messages) {
          await this.handleOneMessage(msg, contacts, account);
        }
      }
    }
  }

  private async resolveAccountByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<ResolvedWhatsappAccount | null> {
    const cacheKey = whatsappPhoneCacheKey(phoneNumberId);
    const cachedRaw = await this.cache.get(cacheKey);
    if (cachedRaw) {
      const fromCache = parseWhatsappAccountFromCache(cachedRaw);
      if (fromCache && fromCache.metaPhoneNumberId === phoneNumberId) {
        return fromCache;
      }
    }

    const acc = await this.prisma.whatsappAccount.findUnique({
      where: { metaPhoneNumberId: phoneNumberId },
      select: {
        id: true,
        tenantId: true,
        metaPhoneNumberId: true,
        status: true,
      },
    });

    if (acc && isWhatsappAccountActiveForOps(acc.status)) {
      await this.cache.set(
        cacheKey,
        serializeWhatsappAccountForCache(acc),
        WHATSAPP_PHONE_CACHE_TTL_SEC,
      );
    }

    return acc;
  }

  private async handleOneMessage(
    msg: WaIncomingText,
    contacts: WaContact[],
    account: ResolvedWhatsappAccount,
  ): Promise<void> {
    if (msg?.type !== 'text' || typeof msg.text?.body !== 'string') {
      return;
    }
    const body = msg.text.body.trim();
    if (!body) return;

    const from = typeof msg.from === 'string' ? msg.from.trim() : '';
    if (!from) return;

    const name = this.resolveProfileName(from, contacts);

    const allowed = await this.rateLimit.tryConsume(account.tenantId, 'webhook');
    if (!allowed) {
      this.messagingLog.webhookEvent({
        event: 'inbound_dropped_rate_limit',
        tenantId: account.tenantId,
        whatsappAccountId: account.id,
        externalUserId: from,
      });
      return;
    }

    this.messagingLog.webhookEvent({
      event: 'inbound_text',
      tenantId: account.tenantId,
      whatsappAccountId: account.id,
      externalUserId: from,
      messageLength: body.length,
    });

    try {
      const result = await this.chatService.processMessage({
        tenantId: account.tenantId,
        channelType: ChannelType.WHATSAPP,
        externalUserId: from,
        externalUserName: name,
        message: body,
      });

      await this.whatsapp.sendTextMessage({
        tenantId: account.tenantId,
        whatsappAccountId: account.id,
        to: from,
        message: result.reply,
      });

      if (
        result.success &&
        result.products &&
        result.products.length > 0
      ) {
        for (const p of result.products) {
          const caption = `${p.name} - السعر: ${p.price} جنيه`;
          await this.whatsapp.sendImageMessage({
            tenantId: account.tenantId,
            whatsappAccountId: account.id,
            to: from,
            imageUrl: p.imageUrl,
            caption,
          });
        }
      }
    } catch (err) {
      this.messagingLog.webhookWarn('handler_error', {
        tenantId: account.tenantId,
        whatsappAccountId: account.id,
        externalUserId: from,
        message: err instanceof Error ? err.message : String(err),
      });
      this.logger.error(
        'processMessage failed',
        err instanceof Error ? err.stack : err,
      );
    }
  }

  private resolveProfileName(
    from: string,
    contacts: WaContact[],
  ): string | undefined {
    const match = contacts.find((c) => c?.wa_id === from);
    const n = match?.profile?.name;
    return typeof n === 'string' && n.trim() ? n.trim() : undefined;
  }
}
