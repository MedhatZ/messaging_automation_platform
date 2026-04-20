import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  ChannelType,
  LeadStatus,
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

const PRICE_PER_SQM = 200;
const DEFAULT_LEAD_INTEREST = 'زرع';

/** Hard-coded bot copy; tenant `fallback_message` overrides when set. */
const CHAT_MESSAGES = {
  ar: {
    areaPrompt: 'تحب نحسبلك السعر حسب المساحة؟ 👀',
    metersQuestion: 'المساحة كام متر تقريبًا؟',
    priceEstimate: (price: number) =>
      `السعر التقريبي: ${price} جنيه 💰\nتحب تأكد الطلب؟`,
    unclearMeters: 'مش فاهم المساحة، اكتب رقم بالمتر لو سمحت.',
    orderConfirmed: 'تمام 👌 فريقنا هيتواصل معاك خلال دقائق',
    defaultFallback: 'سيتم الرد عليك قريبًا',
  },
  en: {
    areaPrompt: 'Would you like us to estimate the price by area? 👀',
    metersQuestion: 'Roughly how many square meters?',
    priceEstimate: (price: number) =>
      `Approximate price: ${price} EGP 💰\nWould you like to confirm the order?`,
    unclearMeters:
      'I could not read the area. Please type a positive number in meters.',
    orderConfirmed: 'Great 👌 Our team will reach out within minutes.',
    defaultFallback: 'Someone will get back to you shortly.',
  },
} as const;

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

const SALES_IDLE = 'idle';
const SALES_AWAIT_AREA = 'awaiting_area_consent';
const SALES_AWAIT_METERS = 'awaiting_area_meters';
const SALES_AWAIT_CONFIRM = 'awaiting_order_confirm';

const YES_AR = [
  'اه',
  'آه',
  'ايه',
  'نعم',
  'عايز',
  'موافق',
  'تمام',
  'اوكي',
  'أوكي',
  'خلاص',
];

const YES_EN = ['yes', 'yeah', 'yep', 'ok', 'okay', 'sure', 'yup'];

export type FindOrCreateConversationInput = {
  tenantId: string;
  channelType: ChannelType;
  externalUserId: string;
  externalUserName?: string;
};

export type ProcessMessageInput = FindOrCreateConversationInput & {
  message: string;
};

export type ProcessMessageProductSummary = {
  imageUrl: string;
  name: string;
  price: number;
};

export type ProcessMessageResult =
  | {
      success: true;
      matched: boolean;
      reply: string;
      products?: ProcessMessageProductSummary[];
    }
  | {
      success: false;
      matched: false;
      reply: string;
    };

type SalesState =
  | { step: 'idle' }
  | { step: 'awaiting_area_consent' }
  | { step: 'awaiting_area_meters'; interest: string }
  | {
      step: 'awaiting_order_confirm';
      meters: number;
      price: number;
      interest: string;
    };

type SalesFlowOutcome =
  | { kind: 'continue_faq' }
  | {
      kind: 'respond';
      reply: string;
      next: SalesState;
      saveLead?: boolean;
    };

type ConversationSalesRow = {
  id: string;
  salesStep: string;
  tempData: Prisma.JsonValue | null;
  language: string;
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatEngine: ChatEngineService,
    private readonly faqDecision: ChatFaqDecisionService,
    private readonly productDecision: ChatProductDecisionService,
    private readonly orderDecision: ChatOrderDecisionService,
    private readonly aiDecision: ChatAiDecisionService,
  ) {}

  async findOrCreateConversation(
    input: FindOrCreateConversationInput,
  ): Promise<ConversationSalesRow> {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        tenantId: input.tenantId,
        externalUserId: input.externalUserId,
      },
      select: { id: true, salesStep: true, tempData: true, language: true },
    });
    if (existing) {
      return existing;
    }
    try {
      return await this.prisma.conversation.create({
        data: {
          tenantId: input.tenantId,
          channelType: input.channelType,
          externalUserId: input.externalUserId,
          externalUserName: input.externalUserName,
        },
        select: { id: true, salesStep: true, tempData: true, language: true },
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

    const state = this.rowToSalesState(conversation);

    if (state.step !== 'idle') {
      const outcome = this.tryHandleSalesFlow(
        input,
        state,
        resolvedLang,
      );
      if (outcome.kind === 'continue_faq') {
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            salesStep: SALES_IDLE,
            tempData: Prisma.JsonNull,
            ...(isFirstMessage && { language: resolvedLang }),
          },
        });
      } else {
        const { reply, next, saveLead } = outcome;
        const now = new Date();
        const salesPatch = this.salesStateToDb(next);
        await this.prisma.$transaction(async (tx) => {
          await this.saveIncomingMessage(tx, conversation.id, input.message);
          if (saveLead) {
            await tx.lead.create({
              data: {
                tenantId: input.tenantId,
                name: input.externalUserName ?? null,
                phone: input.externalUserId,
                interest: DEFAULT_LEAD_INTEREST,
                status: LeadStatus.NEW,
              },
            });
          }
          await this.saveOutgoingMessage(tx, conversation.id, reply);
          await tx.conversation.update({
            where: { id: conversation.id },
            data: {
              lastMessageAt: now,
              salesStep: salesPatch.salesStep,
              tempData: salesPatch.tempData,
              ...(isFirstMessage && { language: resolvedLang }),
            },
          });
        });
        return { success: true, matched: false, reply };
      }
    }

    const decision = await this.handleIncomingMessage(input.message, {
      tenantId: input.tenantId,
      phone: input.externalUserId,
      name: input.externalUserName,
      lang: resolvedLang,
      conversationId: conversation.id,
    });

    this.logger.log(`branch=${decision.branch}`);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.saveIncomingMessage(tx, conversation.id, input.message);
      await this.saveOutgoingMessage(tx, conversation.id, decision.reply);
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: now,
          ...(isFirstMessage && { language: resolvedLang }),
        },
      });
    });

    const products =
      decision.branch === 'product' && decision.products
        ? decision.products
            .filter((p) => p.imageUrl && p.imageUrl.trim())
            .map((p) => ({
              imageUrl: p.imageUrl!.trim(),
              name: p.name,
              price: p.price,
            }))
        : undefined;

    return {
      success: true,
      matched: decision.branch === 'faq',
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

  private rowToSalesState(row: ConversationSalesRow): SalesState {
    switch (row.salesStep) {
      case SALES_AWAIT_AREA:
        return { step: 'awaiting_area_consent' };
      case SALES_AWAIT_METERS: {
        const d = (row.tempData as Record<string, unknown> | null) ?? {};
        const interest =
          typeof d.interest === 'string' ? d.interest : DEFAULT_LEAD_INTEREST;
        return { step: 'awaiting_area_meters', interest };
      }
      case SALES_AWAIT_CONFIRM: {
        const d = (row.tempData as Record<string, unknown> | null) ?? {};
        const meters = Number(d.meters);
        const price = Number(d.price);
        const interest =
          typeof d.interest === 'string' ? d.interest : DEFAULT_LEAD_INTEREST;
        return {
          step: 'awaiting_order_confirm',
          meters: Number.isFinite(meters) ? meters : 0,
          price: Number.isFinite(price) ? price : 0,
          interest,
        };
      }
      default:
        return { step: 'idle' };
    }
  }

  private salesStateToDb(next: SalesState): {
    salesStep: string;
    tempData: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  } {
    switch (next.step) {
      case 'idle':
        return { salesStep: SALES_IDLE, tempData: Prisma.JsonNull };
      case 'awaiting_area_consent':
        return { salesStep: SALES_AWAIT_AREA, tempData: Prisma.JsonNull };
      case 'awaiting_area_meters':
        return {
          salesStep: SALES_AWAIT_METERS,
          tempData: { interest: next.interest },
        };
      case 'awaiting_order_confirm':
        return {
          salesStep: SALES_AWAIT_CONFIRM,
          tempData: {
            meters: next.meters,
            price: next.price,
            interest: next.interest,
          },
        };
    }
  }

  private tryHandleSalesFlow(
    input: ProcessMessageInput,
    state: SalesState,
    lang: ChatLang,
  ): SalesFlowOutcome {
    const norm = this.normalizeForYes(input.message, lang);

    switch (state.step) {
      case 'awaiting_area_consent':
        if (this.matchesYes(norm, lang)) {
          return {
            kind: 'respond',
            reply: CHAT_MESSAGES[lang].metersQuestion,
            next: {
              step: 'awaiting_area_meters',
              interest: DEFAULT_LEAD_INTEREST,
            },
          };
        }
        return { kind: 'continue_faq' };

      case 'awaiting_area_meters': {
        const meters = this.extractFirstNumber(input.message);
        if (meters != null) {
          const price = Math.round(meters * PRICE_PER_SQM);
          return {
            kind: 'respond',
            reply: CHAT_MESSAGES[lang].priceEstimate(price),
            next: {
              step: 'awaiting_order_confirm',
              meters,
              price,
              interest: state.interest,
            },
          };
        }
        return {
          kind: 'respond',
          reply: CHAT_MESSAGES[lang].unclearMeters,
          next: state,
        };
      }

      case 'awaiting_order_confirm':
        if (this.matchesYes(norm, lang)) {
          return {
            kind: 'respond',
            reply: CHAT_MESSAGES[lang].orderConfirmed,
            next: { step: 'idle' },
            saveLead: true,
          };
        }
        return { kind: 'continue_faq' };

      default:
        return { kind: 'continue_faq' };
    }
  }

  /** Same idea as FAQ keyword step: English lowercased, Arabic as-is (trimmed). */
  private normalizeForYes(text: string, lang: ChatLang): string {
    const collapsed = text.trim().replace(/\s+/g, ' ');
    return lang === 'en' ? collapsed.toLowerCase() : collapsed;
  }

  private matchesYes(normalized: string, lang: ChatLang): boolean {
    const lower = normalized.toLowerCase();
    const arHit = YES_AR.some((w) => normalized.includes(w));
    const enHit = YES_EN.some((w) => lower.includes(w));
    return lang === 'ar' ? arHit || enHit : enHit || arHit;
  }

  private extractFirstNumber(text: string): number | null {
    const normalized = text.replace(/,/g, '.');
    const m = normalized.match(/(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
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
      select: { imageUrls: true, name: true, price: true },
    });

    const out: ProcessMessageProductSummary[] = [];
    for (const p of rows) {
      const url = p.imageUrls?.[0]?.trim();
      if (!url) continue;
      out.push({ imageUrl: url, name: p.name, price: p.price });
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
    },
  ): Promise<DecisionResult> {
    const raw = (message ?? '').toString();
    const normalized = raw.trim().replace(/\s+/g, ' ');
    if (!normalized) {
      return {
        branch: 'ai',
        reply: await this.aiDecision.ask(normalized, {
          tenantId: context.tenantId,
          lang: context.lang,
          products: await this.productDecision.fetchTopProducts(context.tenantId),
          faqs: await this.fetchFaqContext(context.tenantId, context.lang),
          history: await this.fetchConversationHistory(context.conversationId),
        }),
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
      const products = await this.productDecision.fetchTopProducts(
        context.tenantId,
      );
      if (!products || products.length === 0) {
        return { branch: 'product', reply: 'حاليًا مفيش منتجات متاحة' };
      }
      return {
        branch: 'product',
        reply: 'دي بعض المنتجات عندنا 👇',
        products,
      };
    }

    return {
      branch: 'ai',
      reply: await this.aiDecision.ask(normalized, {
        tenantId: context.tenantId,
        lang: context.lang,
        products: await this.productDecision.fetchTopProducts(context.tenantId),
        faqs: await this.fetchFaqContext(context.tenantId, context.lang),
        history: await this.fetchConversationHistory(context.conversationId),
      }),
    };
  }

  private async fetchConversationHistory(
    conversationId: string,
  ): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 3,
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
