import { Injectable } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { normalizeArabic } from '../../common/normalize-arabic';

const ORDER_INTENT = [
  'عايز اطلب',
  'عاوز اطلب',
  'اريد الطلب',
  'اشتري',
  'شراء',
  'اوردر',
  'order',
  'buy',
  'هاخد',
  'محتاج اطلب',
];

const CANCEL_INTENT = [
  'الغاء',
  'إلغاء',
  'كنسل',
  'cancel',
  'stop',
] as const;

const SHOW_PRODUCTS_INTENT = [
  'منتجات',
  'المنتجات',
  'اعرض المنتجات',
  'عرض المنتجات',
  'اشوف المنتجات',
  'أشوف المنتجات',
  'catalog',
  'products',
] as const;

const ORDER_FLOW_TTL_MS = 15 * 60 * 1000;

// المرحلة 1 — طلب الاسم
const ASK_NAME = `تمام! 😊 هنكمل الطلب دلوقتي.
ابعتلي اسمك الأول لو سمحت.`;

// المرحلة 2 — طلب رقم الهاتف
const ASK_PHONE = `تمام 👍 وإيه رقم تليفونك عشان نتواصل معاك؟`;

// المرحلة 3 — طلب العنوان
const ASK_ADDRESS = `ممتاز! 📍 وإيه عنوان التوصيل بالتفصيل؟`;

// المرحلة 4 — طلب المنتج
const ASK_PRODUCT = `حلو! 🛍️ إيه المنتج اللي عايزه؟ (اكتب اسمه أو رقمه من القائمة)`;

// المرحلة 5 — طلب ملاحظات
const ASK_NOTES = `أي ملاحظات إضافية؟ (مقاس، لون، أي تفاصيل تانية)
أو ابعت "لا" لو مفيش.`;

// المرحلة 6 — تأكيد الطلب
const ORDER_CONFIRM = (
  name: string,
  phone: string,
  address: string,
  product: string,
  notes: string,
) =>
  `✅ تم استلام طلبك!

👤 الاسم: ${name}
📱 التليفون: ${phone}
📍 العنوان: ${address}
🛍️ المنتج: ${product}
📝 ملاحظات: ${notes}

هنتواصل معاك قريباً لتأكيد الطلب 🙏`;

type OrderStep =
  | 'awaiting_name'
  | 'awaiting_phone'
  | 'awaiting_address'
  | 'awaiting_product'
  | 'awaiting_notes'
  | 'done';

@Injectable()
export class ChatOrderDecisionService {
  constructor(private readonly prisma: PrismaService) {}

  isOrderIntent(message: string): boolean {
    const normalized = normalizeArabic(message.toLowerCase());
    return ORDER_INTENT.some((k) =>
      normalized.includes(normalizeArabic(k.toLowerCase())),
    );
  }

  async tryHandle(input: {
    tenantId: string;
    phone: string;
    message: string;
    name?: string;
  }): Promise<{ handled: true; reply: string } | { handled: false }> {
    const phone = (input.phone ?? '').trim();
    if (!phone) return { handled: false };

    const msg = String(input.message ?? '').trim();
    const normalized = normalizeArabic(msg.toLowerCase());

    // Let product listing bypass order flow.
    if (this.isShowProductsIntent(normalized)) {
      return { handled: false };
    }

    // Allow user to cancel an in-progress order flow.
    if (this.isCancelIntent(normalized)) {
      await this.prisma.lead
        .update({
          where: { tenantId_phone: { tenantId: input.tenantId, phone } },
          data: { orderStep: null },
        })
        .catch(() => undefined);
      return { handled: true, reply: 'تمام، تم إلغاء الطلب. تحب أساعدك في إيه؟' };
    }

    // جيب الـ lead الحالي لو في order جاري
    const pending = await this.prisma.lead.findFirst({
      where: {
        tenantId: input.tenantId,
        phone,
        status: LeadStatus.NEW,
        orderStep: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderStep: true,
        name: true,
        orderPhone: true,
        location: true,
        interest: true,
        size: true,
        updatedAt: true,
      },
    });

    if (pending) {
      const isFresh =
        Date.now() - new Date(pending.updatedAt).getTime() <= ORDER_FLOW_TTL_MS;
      // If the flow is stale, only resume when user explicitly shows order intent.
      if (!isFresh && !this.isOrderIntent(msg)) {
        return { handled: false };
      }
      return this.handleOrderStep(pending, msg, input.tenantId);
    }

    // مفيش order جاري — تحقق من intent
    if (!this.isOrderIntent(msg)) return { handled: false };

    // ابدأ order جديد
    await this.prisma.lead.upsert({
      where: { tenantId_phone: { tenantId: input.tenantId, phone } },
      update: {
        lastMessage: msg,
        orderStep: 'awaiting_name',
        status: LeadStatus.NEW,
      },
      create: {
        tenantId: input.tenantId,
        phone,
        name: input.name ?? null,
        status: LeadStatus.NEW,
        lastMessage: msg,
        orderStep: 'awaiting_name',
      },
    });

    return { handled: true, reply: ASK_NAME };
  }

  private isCancelIntent(normalizedLowerArabic: string): boolean {
    return CANCEL_INTENT.some((k) =>
      normalizedLowerArabic.includes(normalizeArabic(String(k).toLowerCase())),
    );
  }

  private isShowProductsIntent(normalizedLowerArabic: string): boolean {
    return SHOW_PRODUCTS_INTENT.some((k) =>
      normalizedLowerArabic.includes(normalizeArabic(String(k).toLowerCase())),
    );
  }

  private looksLikePhone(text: string): boolean {
    const digits = text.replace(/[^\d]/g, '');
    return digits.length >= 8 && digits.length <= 15;
  }

  private async handleOrderStep(
    lead: {
      id: string;
      orderStep: string | null;
      name: string | null;
      orderPhone: string | null;
      location: string | null;
      interest: string | null;
      size: string | null;
      updatedAt: Date;
    },
    message: string,
    tenantId: string,
  ): Promise<{ handled: true; reply: string }> {
    void tenantId;
    const step = lead.orderStep as OrderStep;
    const text = message.trim();

    switch (step) {
      case 'awaiting_name': {
        if (!text || text.length < 2) {
          return { handled: true, reply: ASK_NAME };
        }
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: { name: text, orderStep: 'awaiting_phone' },
        });
        return { handled: true, reply: ASK_PHONE };
      }

      case 'awaiting_phone': {
        if (!this.looksLikePhone(text)) {
          return {
            handled: true,
            reply: 'ممكن رقم تليفون صحيح من فضلك؟ (مثال: 01xxxxxxxxx)',
          };
        }
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: { orderPhone: text, orderStep: 'awaiting_address' },
        });
        return { handled: true, reply: ASK_ADDRESS };
      }

      case 'awaiting_address': {
        if (text.length < 6) {
          return { handled: true, reply: ASK_ADDRESS };
        }
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: { location: text, orderStep: 'awaiting_product' },
        });
        return { handled: true, reply: ASK_PRODUCT };
      }

      case 'awaiting_product': {
        // Allow user to ask for products list instead of capturing it as product name.
        const normalized = normalizeArabic(text.toLowerCase());
        if (this.isShowProductsIntent(normalized)) {
          return { handled: true, reply: 'أكيد—قولّي بس عايز تشوف إيه بالظبط؟ أو ابعت "اعرض المنتجات".' };
        }
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: { interest: text, orderStep: 'awaiting_notes' },
        });
        return { handled: true, reply: ASK_NOTES };
      }

      case 'awaiting_notes': {
        const notes =
          text.toLowerCase() === 'لا' || text === 'no' ? 'لا يوجد' : text;
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: {
            size: notes,
            orderStep: 'done',
            status: LeadStatus.ORDER_PENDING,
            lastMessage: message,
          },
        });

        const reply = ORDER_CONFIRM(
          lead.name ?? '—',
          lead.orderPhone ?? '—',
          lead.location ?? '—',
          lead.interest ?? '—',
          notes,
        );

        return { handled: true, reply };
      }

      default:
        return {
          handled: true,
          reply: 'تم تسجيل طلبك مسبقاً، هنتواصل معاك قريباً 🙏',
        };
    }
  }
}

