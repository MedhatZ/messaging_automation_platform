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
  async handleMessage(payload: { from: string; text: string }) {
    const { from, text } = payload;
    const phone = from.replace('@s.whatsapp.net', '').replace('@g.us', '');

    // جيب أول tenant نشط (في multi-tenant هتحتاج تربط كل رقم بـ tenant)
    const tenant = await this.prisma.tenant.findFirst({
      where: { isActive: true },
      select: { id: true },
    });

    if (!tenant) {
      this.logger.warn('No active tenant found');
      return;
    }

    try {
      // رسالة الترحيب لأول رسالة
      const isFirst = !(await this.prisma.conversation.findFirst({
        where: { tenantId: tenant.id, externalUserId: phone },
        select: { id: true },
      }));

      if (isFirst) {
        const settings = await this.prisma.botSettings.findUnique({
          where: { tenantId: tenant.id },
          select: { welcomeMessage: true, welcomeImages: true },
        });

        const tenant_data = await this.prisma.tenant.findUnique({
          where: { id: tenant.id },
          select: { slug: true, name: true },
        });

        // ابعت رسالة الترحيب
        if (settings?.welcomeMessage?.trim()) {
          await this.baileys.sendText(from, settings.welcomeMessage.trim());
          await new Promise((r) => setTimeout(r, 1000));
        }

        // ابعت الصور
        if (Array.isArray(settings?.welcomeImages)) {
          for (const img of settings.welcomeImages) {
            if (img?.trim()) {
              await this.baileys.sendImage(from, img.trim());
              await new Promise((r) => setTimeout(r, 1000));
            }
          }
        }

        // ابعت رابط صفحة الشراء
        if (tenant_data?.slug) {
          const shopUrl = `https://messaging-automation-platform.vercel.app/shop.html?slug=${tenant_data.slug}`;
          await this.baileys.sendText(
            from,
            `🛒 تقدر تشوف منتجاتنا وتطلب من هنا:\n${shopUrl}`,
          );
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      const result = await this.chatService.processMessage({
        tenantId: tenant.id,
        channelType: ChannelType.WHATSAPP,
        externalUserId: phone,
        externalUserName: undefined,
        message: text,
      });

      if (result.success) {
        if (result.products?.length) {
          for (const p of result.products) {
            const imageUrl = (p as any)?.imageUrl;
            if (imageUrl) {
              await this.baileys.sendImage(
                from,
                imageUrl,
                `${(p as any)?.name ?? ''}\nالسعر: ${(p as any)?.price ?? ''} جنيه`,
              );
            }
          }
        }
        await this.baileys.sendText(from, result.reply);
      }
    } catch (e) {
      this.logger.error('Message handling failed', e);
    }
  }
}

