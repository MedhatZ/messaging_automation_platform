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
  'ابعتلي',
];

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
      },
    });

    if (pending) {
      return this.handleOrderStep(pending, input.message, input.tenantId);
    }

    // مفيش order جاري — تحقق من intent
    if (!this.isOrderIntent(input.message)) return { handled: false };

    // ابدأ order جديد
    await this.prisma.lead.upsert({
      where: { tenantId_phone: { tenantId: input.tenantId, phone } },
      update: {
        lastMessage: input.message,
        orderStep: 'awaiting_name',
        status: LeadStatus.NEW,
      },
      create: {
        tenantId: input.tenantId,
        phone,
        name: input.name ?? null,
        status: LeadStatus.NEW,
        lastMessage: input.message,
        orderStep: 'awaiting_name',
      },
    });

    return { handled: true, reply: ASK_NAME };
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
    },
    message: string,
    tenantId: string,
  ): Promise<{ handled: true; reply: string }> {
    void tenantId;
    const step = lead.orderStep as OrderStep;
    const text = message.trim();

    switch (step) {
      case 'awaiting_name': {
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: { name: text, orderStep: 'awaiting_phone' },
        });
        return { handled: true, reply: ASK_PHONE };
      }

      case 'awaiting_phone': {
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: { orderPhone: text, orderStep: 'awaiting_address' },
        });
        return { handled: true, reply: ASK_ADDRESS };
      }

      case 'awaiting_address': {
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: { location: text, orderStep: 'awaiting_product' },
        });
        return { handled: true, reply: ASK_PRODUCT };
      }

      case 'awaiting_product': {
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

