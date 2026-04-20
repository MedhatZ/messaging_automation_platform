import { Injectable } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { normalizeArabic } from '../../common/normalize-arabic';

const ORDER_INTENT = [
  'عايز',
  'عاوز',
  'اريد',
  'طلب',
  'أطلب',
  'اشتري',
  'شراء',
  'اوردر',
  'order',
  'buy',
];

const ORDER_PROMPT = `تمام 👍
ابعتلي:

1. المقاس
2. المكان`;

const ORDER_CONFIRM = 'تمام 👍 هنجهز الطلب ونتواصل معاك';

@Injectable()
export class ChatOrderDecisionService {
  constructor(private readonly prisma: PrismaService) {}

  isOrderIntent(message: string): boolean {
    const normalized = normalizeArabic(message);
    return ORDER_INTENT.some((k) =>
      normalized.includes(normalizeArabic(k)),
    );
  }

  private parseOrderDetails(message: string): {
    size: string | null;
    location: string | null;
  } {
    const raw = message.trim();
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length >= 2) {
      return { size: lines[0] || null, location: lines[1] || null };
    }

    const m = raw.match(/^(.{1,40}?)(?:\s+|-|,|؛|:)\s*(.{1,120})$/);
    if (m) {
      const size = m[1]?.trim();
      const location = m[2]?.trim();
      return { size: size || null, location: location || null };
    }

    return { size: raw ? raw.slice(0, 120) : null, location: null };
  }

  async tryHandle(input: {
    tenantId: string;
    phone: string;
    message: string;
    name?: string;
  }): Promise<{ handled: true; reply: string } | { handled: false }> {
    const phone = (input.phone ?? '').trim();
    if (!phone) return { handled: false };

    const pending = await this.prisma.lead.findFirst({
      where: { tenantId: input.tenantId, phone, status: LeadStatus.NEW },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (pending) {
      const details = this.parseOrderDetails(input.message);
      await this.prisma.lead.update({
        where: { id: pending.id },
        data: {
          status: LeadStatus.ORDER_PENDING,
          lastMessage: input.message,
          size: details.size,
          location: details.location,
          ...(input.name && { name: input.name }),
        },
      });
      return { handled: true, reply: ORDER_CONFIRM };
    }

    if (!this.isOrderIntent(input.message)) return { handled: false };

    // eslint-disable-next-line no-console
    console.log('Order intent detected');

    await this.prisma.lead.upsert({
      where: {
        tenantId_phone: {
          tenantId: input.tenantId,
          phone,
        },
      },
      update: { lastMessage: input.message },
      create: {
        tenantId: input.tenantId,
        phone,
        name: input.name ?? null,
        status: LeadStatus.NEW,
        lastMessage: input.message,
      },
    });

    return { handled: true, reply: ORDER_PROMPT };
  }
}

