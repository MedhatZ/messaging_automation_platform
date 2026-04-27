import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ChannelType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ChatService } from '../../chat/chat.service';
import { BaileysService } from './baileys.service';

@Injectable()
export class BaileysMessageHandler {
  private readonly logger = new Logger(BaileysMessageHandler.name);

  constructor(
    private readonly baileys: BaileysService,
    private readonly chatService: ChatService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('baileys.message')
  async handleMessage(payload: { tenantId: string; from: string; text: string }) {
    const { tenantId, from, text } = payload;
    const phone = from.replace('@s.whatsapp.net', '').replace('@g.us', '');
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, isActive: true, slug: true, name: true },
    });
    if (!tenant) {
      this.logger.warn(`Tenant not found: tenantId=${tenantId}`);
      return;
    }
    if (!tenant.isActive) {
      this.logger.warn(`Tenant inactive: tenantId=${tenantId}`);
      return;
    }

    try {
      // رسالة الترحيب لأول رسالة
      const isFirst = !(await this.prisma.conversation.findFirst({
        where: { tenantId, externalUserId: phone },
        select: { id: true },
      }));

      if (isFirst) {
        const settings = await this.prisma.botSettings.findUnique({
          where: { tenantId },
          select: { welcomeMessage: true, welcomeImages: true },
        });

        // ابعت رسالة الترحيب
        if (settings?.welcomeMessage?.trim()) {
          await this.baileys.sendText(tenantId, from, settings.welcomeMessage.trim());
          await new Promise((r) => setTimeout(r, 1000));
        }

        // ابعت الصور
        if (Array.isArray(settings?.welcomeImages)) {
          for (const img of settings.welcomeImages) {
            if (img?.trim()) {
              await this.baileys.sendImage(tenantId, from, img.trim());
              await new Promise((r) => setTimeout(r, 1000));
            }
          }
        }

        // ابعت رابط صفحة الشراء
        if (tenant.slug) {
          const shopUrl = `https://messaging-automation-platform.vercel.app/shop.html?slug=${tenant.slug}`;
          await this.baileys.sendText(tenantId, from, `🛒 تقدر تشوف منتجاتنا وتطلب من هنا:\n${shopUrl}`);
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      const waAccount = await this.prisma.whatsappAccount.findFirst({
        where: { tenantId, status: 'active' },
        select: { id: true },
      });

      const result = await this.chatService.processMessage({
        tenantId,
        channelType: ChannelType.WHATSAPP,
        externalUserId: phone,
        externalUserName: undefined,
        message: text,
        whatsappAccountId: waAccount?.id,
      });

      if (result.success) {
        // ابعت الصور لو في منتجات
        if (result.products?.length) {
          for (const p of result.products) {
            if (p.imageUrl) {
              await this.baileys.sendImage(
                tenantId,
                from,
                p.imageUrl,
                `${p.name}\nالسعر: ${p.price} جنيه`,
              );
              await new Promise((r) => setTimeout(r, 1000));
            }
          }
        }
        // ابعت الرد النصي
        await this.baileys.sendText(tenantId, from, result.reply);
      }
    } catch (e) {
      this.logger.error('Message handling failed', e);
    }
  }
}

