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
      await this.sendWelcomeIfFirstContact(account, from);

      const result = await this.chatService.processMessage({
        tenantId: account.tenantId,
        channelType: ChannelType.WHATSAPP,
        externalUserId: from,
        externalUserName: name,
        message: body,
      });

      const productSummaries = result.success ? result.products ?? [] : [];
      const productIds = productSummaries
        .map((p) => (p?.id ?? '').toString().trim())
        .filter(Boolean);

      if (productIds.length > 0) {
        // Load full product data (description + imageUrls) for richer outbound messages.
        const rows = await this.prisma.product.findMany({
          where: {
            tenantId: account.tenantId,
            isActive: true,
            id: { in: productIds },
          },
        });

        const byId = new Map(rows.map((p) => [p.id, p]));
        const ordered = productIds
          .map((id) => byId.get(id))
          .filter((p): p is NonNullable<typeof p> => Boolean(p));

        if (ordered.length > 0) {
          await this.sendProductCarouselReply(account, from, ordered, result.reply);
          return;
        }
      }

      // Fallback: send a plain text reply (e.g. <2 products or no catalogId).
      await this.whatsapp.sendTextMessage({
        tenantId: account.tenantId,
        whatsappAccountId: account.id,
        to: from,
        message: result.reply,
      });
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

  private async sendWelcomeIfFirstContact(
    account: ResolvedWhatsappAccount,
    externalUserId: string,
  ): Promise<void> {
    const welcomeKey = `welcome_sent:${account.tenantId}:${externalUserId}`;
    const cached = await this.cache.get(welcomeKey);
    if (cached) {
      return;
    }

    const existing = await this.prisma.conversation.findFirst({
      where: { tenantId: account.tenantId, externalUserId },
      select: { id: true },
    });
    if (existing) {
      await this.cache.set(welcomeKey, '1', 2_592_000);
      return;
    }

    const settings = await this.prisma.botSettings.findUnique({
      where: { tenantId: account.tenantId },
      select: { welcomeMessage: true, welcomeImages: true, welcomeVideos: true },
    });

    const welcomeMessage = String(settings?.welcomeMessage ?? '').trim();
    if (welcomeMessage) {
      await this.whatsapp.sendTextMessage({
        tenantId: account.tenantId,
        whatsappAccountId: account.id,
        to: externalUserId,
        message: welcomeMessage,
      });
    }

    const welcomeImages = Array.isArray(settings?.welcomeImages)
      ? settings?.welcomeImages
      : [];
    for (const rawUrl of welcomeImages) {
      const imageUrl = String(rawUrl ?? '').trim();
      if (!imageUrl) continue;
      await this.whatsapp.sendImageMessage({
        tenantId: account.tenantId,
        whatsappAccountId: account.id,
        to: externalUserId,
        imageUrl,
      });
    }

    const welcomeVideos = Array.isArray(settings?.welcomeVideos)
      ? settings?.welcomeVideos
      : [];
    for (const rawUrl of welcomeVideos) {
      const videoUrl = String(rawUrl ?? '').trim();
      if (!videoUrl) continue;
      await this.whatsapp.sendVideoMessage({
        tenantId: account.tenantId,
        whatsappAccountId: account.id,
        to: externalUserId,
        videoUrl,
      });
    }

    await this.cache.set(welcomeKey, '1', 2_592_000);
  }

  private async sendProductCarouselReply(
    account: ResolvedWhatsappAccount,
    to: string,
    products: any[],
    fallbackText?: string,
  ): Promise<void> {
    this.logger.debug(`sendProductCarouselReply: products=${products.length}`);

    // Keep a constant delay to reduce spam risk.
    const delayMs = 1500;

    for (const p of products) {
      const imageUrl = Array.isArray(p?.imageUrls)
        ? String(p.imageUrls?.[0] ?? '').trim()
        : String(p?.imageUrl ?? '').trim();
      const description = String(p?.description ?? '').trim();
      const caption = `${p?.name ?? ''}\nالسعر: ${p?.price ?? ''} جنيه\n\n${description}`.trim();

      if (imageUrl) {
        await this.whatsapp.sendImageMessage({
          tenantId: account.tenantId,
          whatsappAccountId: account.id,
          to,
          imageUrl,
          caption,
        });
      } else {
        await this.whatsapp.sendTextMessage({
          tenantId: account.tenantId,
          whatsappAccountId: account.id,
          to,
          message: caption,
        });
      }

      await this.whatsapp.sendInteractiveButtons({
        tenantId: account.tenantId,
        whatsappAccountId: account.id,
        to,
        bodyText: `هل تريد شراء ${String(p?.name ?? '').trim() || 'هذا المنتج'}؟`,
        buttons: [
          { id: `buy_${p.id}`, title: 'اشتري' },
          { id: `ask_${p.id}`, title: 'استفسار' },
        ],
      });

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    if (fallbackText?.trim()) {
      // Optional: send a final small text after listing products (kept disabled by default).
      void fallbackText;
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
