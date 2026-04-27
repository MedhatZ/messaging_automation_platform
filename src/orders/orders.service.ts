import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { WhatsappSendProducer } from '../queues/whatsapp-send/whatsapp-send.producer';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly producer: WhatsappSendProducer,
  ) {}

  async findAll(tenantId: string) {
    return this.prisma.order.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(id: string, status: string, tenantId: string) {
    const allowed = new Set(['pending', 'confirmed', 'cancelled', 'delivered']);
    const nextStatus = allowed.has(status) ? status : 'pending';

    const order = await this.prisma.order.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        customerPhone: true,
        customerName: true,
        sourcePhone: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const result = await this.prisma.order.updateMany({
      where: { id, tenantId },
      data: { status: nextStatus, updatedAt: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException('Order not found');
    }

    // جيب الـ WhatsApp account للـ tenant
    const waAccount = await this.prisma.whatsappAccount.findFirst({
      where: { tenantId, status: 'active' },
      select: { id: true },
    });

    if (waAccount && order.customerPhone) {
      const message =
        nextStatus === 'confirmed'
          ? `أهلاً ${order.customerName ?? ''} 😊\nتم تأكيد طلبك! 🎉 هنتواصل معاك قريباً للتوصيل 🚚`
          : `أهلاً ${order.customerName ?? ''} 🙏\nمعلش، في مشكلة في طلبك. تواصل معانا عشان نحلها على طول ✅`;

      try {
        await this.producer.enqueueText({
          tenantId,
          whatsappAccountId: waAccount.id,
          to: order.customerPhone.replace(/\D/g, ''),
          message,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('WhatsApp notify failed:', e);
      }
    }

    return { count: 1 };
  }
}

