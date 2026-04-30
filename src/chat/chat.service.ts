import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  ChannelType,
  MessageDirection,
  Prisma,
} from '@prisma/client';
import type { ChatLang } from '../common/detect-message-language';
import { detectMessageLanguage } from '../common/detect-message-language';
import { PrismaService } from '../database/prisma.service';
import { ChatEngineService } from './chat-engine.service';
import { ChatAiDecisionService } from './decision-engine/ai.service';
import type { DecisionResult } from './decision-engine/chat-decision.types';
import { ChatFaqDecisionService } from './decision-engine/faq.service';
import { ChatOrderDecisionService } from './decision-engine/order.service';
import { ChatProductDecisionService } from './decision-engine/product.service';
import { ConversationMemoryService } from './services/conversation-memory.service';
import { ProductTrackingService } from '../products/services/product-tracking.service';
import { ConversationGateway } from '../gateways/conversation.gateway';
import { FollowUpService } from './services/follow-up.service';
import { LeadClassifierService } from './services/lead-classifier.service';
import { CacheService } from '../cache/cache.service';
import type { ProductCard } from './decision-engine/chat-decision.types';

/** When tenant is blocked (inactive / expired subscription). */
const TENANT_ACCESS = {
  ar: {
    inactive: 'الحساب غير مفعل، تواصل مع الدعم',
    expired: 'الاشتراك انتهى، جدد الاشتراك للمتابعة',
  },
  en: {
    inactive: 'Your account is inactive. Please contact support.',
    expired: 'Your subscription has expired. Please renew to continue.',
  },
} as const;

export type FindOrCreateConversationInput = {
  tenantId: string;
  channelType: ChannelType;
  externalUserId: string;
  externalUserName?: string;
  whatsappAccountId?: string;
};

export type ProcessMessageInput = FindOrCreateConversationInput & {
  message: string;
};

export type ProcessMessageProductSummary = {
  id: string;
  imageUrl: string;
  name: string;
  price: number;
};

export type ProcessMessageResult =
  | {
      success: true;
      matched: boolean;
      branch: DecisionResult['branch'];
      reply: string;
      products?: ProcessMessageProductSummary[];
    }
  | {
      success: false;
      matched: false;
      reply: string;
    };

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly chatEngine: ChatEngineService,
    private readonly faqDecision: ChatFaqDecisionService,
    private readonly productDecision: ChatProductDecisionService,
    private readonly orderDecision: ChatOrderDecisionService,
    private readonly aiDecision: ChatAiDecisionService,
    private readonly memory: ConversationMemoryService,
    private readonly productTracking: ProductTrackingService,
    private readonly gateway: ConversationGateway,
    private readonly followUp: FollowUpService,
    private readonly leadClassifier: LeadClassifierService,
  ) {}

  async findOrCreateConversation(
    input: FindOrCreateConversationInput,
  ): Promise<{ id: string; language: string }> {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        tenantId: input.tenantId,
        externalUserId: input.externalUserId,
      },
      select: { id: true, language: true, tempData: true },
    });
    if (existing) {
      if (input.whatsappAccountId) {
        const current = existing.tempData ?? {};
        if (
          typeof current === 'object' &&
          current !== null &&
          (current as any).whatsappAccountId !== input.whatsappAccountId
        ) {
          void this.prisma.conversation
            .update({
              where: { id: existing.id },
              data: {
                tempData: {
                  ...(current as Record<string, unknown>),
                  whatsappAccountId: input.whatsappAccountId,
                },
              },
            })
            .catch(() => undefined);
        }
      }
      return existing;
    }
    try {
      return await this.prisma.conversation.create({
        data: {
          tenantId: input.tenantId,
          channelType: input.channelType,
          externalUserId: input.externalUserId,
          externalUserName: input.externalUserName,
          ...(input.whatsappAccountId
            ? { tempData: { whatsappAccountId: input.whatsappAccountId } }
            : {}),
        },
        select: { id: true, language: true },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new BadRequestException('Invalid tenantId');
      }
      throw e;
    }
  }

  saveIncomingMessage(
    tx: Prisma.TransactionClient,
    conversationId: string,
    content: string,
  ) {
    return tx.message.create({
      data: {
        conversationId,
        direction: MessageDirection.INCOMING,
        content,
      },
    });
  }

  saveOutgoingMessage(
    tx: Prisma.TransactionClient,
    conversationId: string,
    content: string,
  ) {
    return tx.message.create({
      data: {
        conversationId,
        direction: MessageDirection.OUTGOING,
        content,
      },
    });
  }

  async processMessage(
    input: ProcessMessageInput,
  ): Promise<ProcessMessageResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { isActive: true, subscriptionEnd: true },
    });
    if (!tenant) {
      throw new BadRequestException(
        'Tenant not found. Ensure the tenant id exists in the tenants table.',
      );
    }

    const accessLang = await this.resolveLangForTenantAccess(input);
    const blocked = this.checkTenantAccess(tenant, accessLang);
    if (blocked) {
      return { success: false, matched: false, reply: blocked.reply };
    }

    const conversation = await this.findOrCreateConversation(input);

    const messageCount = await this.prisma.message.count({
      where: { conversationId: conversation.id },
    });
    const isFirstMessage = messageCount === 0;
    const resolvedLang: ChatLang = isFirstMessage
      ? detectMessageLanguage(input.message)
      : this.coerceConversationLang(conversation.language);

    // Save user message into semantic memory as early as possible (best-effort).
    // This must always be tenant-scoped.
    void this.memory
      .saveMessage({
        tenantId: input.tenantId,
        conversationId: conversation.id,
        role: 'user',
        messageText: input.message,
      })
      .catch((e) =>
        this.logger.warn(
          `semantic memory save(user) failed: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );

    const semanticContext = await this.memory.getRelevantContext({
      tenantId: input.tenantId,
      conversationId: conversation.id,
      messageText: input.message,
      take: 6,
    });

    const decision = await this.handleIncomingMessage(input.message, {
      tenantId: input.tenantId,
      phone: input.externalUserId,
      name: input.externalUserName,
      lang: resolvedLang,
      conversationId: conversation.id,
      semanticContext,
    });

    this.logger.log(`branch=${decision.branch}`);

    // تصنيف العميل بناءً على رسالته وعلى الـ branch
    const classifiedStatusCandidate =
      decision.branch === 'product'
        ? 'interested'
        : this.leadClassifier.classify(input.message) ?? undefined;

    const classifiedStatus =
      classifiedStatusCandidate === 'hot'
        ? 'hot'
        : classifiedStatusCandidate === 'interested'
          ? await this.prisma.conversation
              .findUnique({
                where: { id: conversation.id },
                select: { leadStatus: true },
              })
              .then((c) => (c?.leadStatus === 'hot' ? undefined : 'interested'))
          : undefined;

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.saveIncomingMessage(tx, conversation.id, input.message);
      await this.saveOutgoingMessage(tx, conversation.id, decision.reply);
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: now,
          ...(isFirstMessage && { language: resolvedLang }),
          ...(classifiedStatus && { leadStatus: classifiedStatus }),
        },
      });
    });

    // Schedule follow-up لو الـ branch مش order
    if (decision.branch !== 'order') {
      const waAccount = await this.prisma.whatsappAccount.findFirst({
        where: { tenantId: input.tenantId, status: 'active' },
        select: { id: true },
      });

      if (waAccount) {
        void this.followUp
          .scheduleFollowUp({
            tenantId: input.tenantId,
            conversationId: conversation.id,
            externalUserId: input.externalUserId,
            whatsappAccountId: waAccount.id,
          })
          .catch((e) =>
            this.logger.warn(
              `follow-up scheduling failed: ${e instanceof Error ? e.message : String(e)}`,
            ),
          );
      }
    }

    this.gateway.emitNewMessage(conversation.id, {
      direction: 'INCOMING',
      content: input.message,
      at: now.toISOString(),
    });
    this.gateway.emitNewMessage(conversation.id, {
      direction: 'OUTGOING',
      content: decision.reply,
      at: now.toISOString(),
    });
    this.gateway.emitConversationUpdated(conversation.id, {
      lastMessageAt: now.toISOString(),
      ...(classifiedStatus && { leadStatus: classifiedStatus }),
    });

    void this.memory
      .saveMessage({
        tenantId: input.tenantId,
        conversationId: conversation.id,
        role: 'assistant',
        messageText: decision.reply,
      })
      .catch((e) =>
        this.logger.warn(
          `semantic memory save(assistant) failed: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );

    const products =
      (decision.branch === 'product' || decision.branch === 'ai') &&
      decision.products
        ? decision.products
            .filter((p) => p.imageUrl && p.imageUrl.trim())
            .map((p) => ({
              id: p.id,
              imageUrl: p.imageUrl!.trim(),
              name: p.name,
              price: p.price,
            }))
        : undefined;

    if (
      (decision.branch === 'product' || decision.branch === 'ai') &&
      decision.products?.length
    ) {
      for (const p of decision.products) {
        void this.productTracking
          .trackProductView({
            tenantId: input.tenantId,
            conversationId: conversation.id,
            productId: p.id,
            viewDuration: 0,
            mentionedInChat: true,
          })
          .catch((e) =>
            this.logger.warn(
              `product tracking failed: ${e instanceof Error ? e.message : String(e)}`,
            ),
          );
      }
    }

    return {
      success: true,
      matched: decision.branch === 'faq',
      branch: decision.branch,
      reply: decision.reply,
      ...(products && products.length > 0 && { products }),
    };
  }

  private coerceConversationLang(raw: string): ChatLang {
    return raw === 'en' ? 'en' : 'ar';
  }

  /**
   * Conversation language if a thread already exists; otherwise detect from this message.
   */
  private async resolveLangForTenantAccess(
    input: ProcessMessageInput,
  ): Promise<ChatLang> {
    const row = await this.prisma.conversation.findFirst({
      where: {
        tenantId: input.tenantId,
        externalUserId: input.externalUserId,
      },
      select: { language: true },
    });
    if (row) {
      return this.coerceConversationLang(row.language);
    }
    return detectMessageLanguage(input.message);
  }

  /**
   * @returns `null` if tenant may use chat; otherwise `{ reply }` to send without persisting.
   */
  private checkTenantAccess(
    tenant: { isActive: boolean; subscriptionEnd: Date | null },
    lang: ChatLang,
  ): { reply: string } | null {
    if (!tenant.isActive) {
      return { reply: TENANT_ACCESS[lang].inactive };
    }
    const end = tenant.subscriptionEnd;
    const now = new Date();
    if (end && end.getTime() < now.getTime()) {
      return { reply: TENANT_ACCESS[lang].expired };
    }
    return null;
  }

  /** Tokenize like the FAQ keyword step so product `hasSome` uses the same word list. */
  private tokenizeForKeywords(message: string, lang: ChatLang): string[] {
    const collapsed = message.trim().replace(/\s+/g, ' ');
    const normalized = lang === 'en' ? collapsed.toLowerCase() : collapsed;
    return normalized.split(/\s+/).filter(Boolean);
  }

  private async findKeywordMatchedProductsWithImages(
    tenantId: string,
    message: string,
    lang: ChatLang,
  ): Promise<ProcessMessageProductSummary[] | undefined> {
    const words = this.tokenizeForKeywords(message, lang);
    if (words.length === 0) {
      return undefined;
    }

    const rows = await this.prisma.product.findMany({
      where: {
        tenantId,
        isActive: true,
        keywords: { hasSome: words },
        imageUrls: { isEmpty: false },
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, imageUrls: true, name: true, price: true },
    });

    const out: ProcessMessageProductSummary[] = [];
    for (const p of rows) {
      const url = p.imageUrls?.[0]?.trim();
      if (!url) continue;
      out.push({ id: p.id, imageUrl: url, name: p.name, price: p.price });
      if (out.length >= 2) break;
    }

    return out.length > 0 ? out : undefined;
  }

  /**
   * Hybrid decision engine (single-branch pipeline):
   * normalize → faq → product → order → ai
   */
  async handleIncomingMessage(
    message: string,
    context: {
      tenantId: string;
      phone: string;
      name?: string;
      lang: ChatLang;
      conversationId: string;
      semanticContext: { role: 'user' | 'assistant'; content: string }[];
    },
  ): Promise<DecisionResult> {
    const raw = (message ?? '').toString();
    const normalized = raw.trim().replace(/\s+/g, ' ');

    // Fetch products ONCE per request (cached in Redis per tenant).
    const products = await this.fetchTopProductsCached(context.tenantId);

    if (!normalized) {
      const aiReply = await this.aiDecision.ask(normalized, {
        tenantId: context.tenantId,
        lang: context.lang,
        products,
        faqs: await this.fetchFaqContext(context.tenantId, context.lang),
        history: await this.fetchConversationHistory(context.conversationId),
        memory: context.semanticContext,
      });

      const mentionedProducts = products.filter((p) => aiReply.includes(p.name));

      return {
        branch: 'ai',
        reply: aiReply,
        products: mentionedProducts.length > 0 ? mentionedProducts : undefined,
      };
    }

    const faq = await this.faqDecision.tryMatch({
      tenantId: context.tenantId,
      message: normalized,
      lang: context.lang,
    });
    if (faq.matched) {
      return { branch: 'faq', reply: faq.answer };
    }

    const order = await this.orderDecision.tryHandle({
      tenantId: context.tenantId,
      phone: context.phone,
      message: normalized,
      name: context.name,
    });
    if (order.handled) {
      return { branch: 'order', reply: order.reply };
    }

    if (this.productDecision.isProductIntent(normalized)) {
      if (!products || products.length === 0) {
        return { branch: 'product', reply: 'حاليًا مفيش منتجات متاحة' };
      }
      // خلي الـ AI يرد بشكل طبيعي مع المنتجات في السياق
      const aiReply = await this.aiDecision.ask(normalized, {
        tenantId: context.tenantId,
        lang: context.lang,
        products,
        faqs: await this.fetchFaqContext(context.tenantId, context.lang),
        history: await this.fetchConversationHistory(context.conversationId),
        memory: context.semanticContext,
      });
      return {
        branch: 'product',
        reply: aiReply,
        products,
      };
    }

    const aiReply = await this.aiDecision.ask(normalized, {
      tenantId: context.tenantId,
      lang: context.lang,
      products,
      faqs: await this.fetchFaqContext(context.tenantId, context.lang),
      history: await this.fetchConversationHistory(context.conversationId),
      memory: context.semanticContext,
    });

    const mentionedProducts = products.filter((p) => aiReply.includes(p.name));

    return {
      branch: 'ai',
      reply: aiReply,
      products: mentionedProducts.length > 0 ? mentionedProducts : undefined,
    };
  }

  private async fetchTopProductsCached(tenantId: string): Promise<ProductCard[]> {
    const cacheKey = `products:${tenantId}`;
    const cached = await this.cache.get(cacheKey);

    if (cached) {
      try {
        const parsed = JSON.parse(cached) as unknown;
        if (Array.isArray(parsed)) {
          return parsed as ProductCard[];
        }
      } catch {
        // ignore cache parse errors; fallback to DB
      }
    }

    const rows = await this.prisma.product.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, price: true, imageUrls: true },
    });

    const products: ProductCard[] = rows.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      imageUrl: Array.isArray(p.imageUrls) ? p.imageUrls[0]?.trim() : undefined,
    }));

    await this.cache.set(cacheKey, JSON.stringify(products), 300);
    return products;
  }

  private async fetchConversationHistory(
    conversationId: string,
  ): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { direction: true, content: true },
    });

    return rows
      .reverse()
      .map((m) => ({
        role: m.direction === MessageDirection.INCOMING ? 'user' : 'assistant',
        content: m.content,
      }));
  }

  private async fetchFaqContext(
    tenantId: string,
    lang: ChatLang,
  ): Promise<{ q: string; a: string }[]> {
    const rows = await this.prisma.faq.findMany({
      where: { tenantId, isActive: true },
      orderBy: { priority: 'desc' },
      take: 50,
      select: {
        questionAr: true,
        answerAr: true,
        questionEn: true,
        answerEn: true,
      },
    });

    return rows.map((f) => ({
      q: lang === 'ar' ? f.questionAr : f.questionEn,
      a: lang === 'ar' ? f.answerAr : f.answerEn,
    }));
  }
}
