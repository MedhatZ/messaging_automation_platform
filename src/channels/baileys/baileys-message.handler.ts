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
      select: { id: true, slug: true, name: true, isActive: true },
    });

    if (!tenant || !tenant.isActive) return;

    const waAccount = await this.prisma.whatsappAccount.findFirst({
      where: { tenantId: tenant.id },
      select: { id: true },
    });

    const appUrl = (process.env.APP_URL ?? '').replace(/\/+$/, '');
    const shopUrl = tenant.slug
      ? `${appUrl}/shop.html?slug=${tenant.slug}`
      : '';

    // ─── Welcome (أول رسالة فقط) ───
    // بدل existingConv check
    const msgCount = await this.prisma.message.count({
      where: {
        conversation: {
          tenantId: tenant.id,
          externalUserId: phone,
        },
      },
    });
    const isFirstMessage = msgCount === 0;

    if (isFirstMessage) {
      const settings = await this.prisma.botSettings.findUnique({
        where: { tenantId: tenant.id },
        select: { welcomeMessage: true, welcomeImages: true },
      });

      if (settings?.welcomeMessage?.trim()) {
        await this.baileys.sendText(tenantId, from, settings.welcomeMessage.trim());
        await new Promise((r) => setTimeout(r, 1000));
      }

      if (Array.isArray(settings?.welcomeImages)) {
        for (const img of settings.welcomeImages) {
          if (img?.trim()) {
            await this.baileys.sendImage(tenantId, from, img.trim());
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }

      if (shopUrl) {
        await new Promise((r) => setTimeout(r, 500));
        await this.baileys.sendText(
          tenantId,
          from,
          `🛒 شوف منتجاتنا واطلب من هنا:\n${shopUrl}`,
        );
      }
    }

    // ─── Chat Engine ───
    try {
      const result = await this.chatService.processMessage({
        tenantId: tenant.id,
        channelType: ChannelType.WHATSAPP,
        externalUserId: phone,
        externalUserName: undefined,
        message: text,
        whatsappAccountId: waAccount?.id,
      });

      if (!result.success) return;

      // ابعت صور المنتجات لو في products
      if (result.products?.length) {
        for (const p of result.products) {
          if (p.imageUrl) {
            try {
              await this.baileys.sendImage(
                tenantId,
                from,
                p.imageUrl,
                `${p.name}\nالسعر: ${p.price} جنيه`,
              );
            } catch {
              await this.baileys.sendText(
                tenantId,
                from,
                `${p.name} - السعر: ${p.price} جنيه`,
              );
            }
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }

      // ابعت الرد
      if (result.reply?.trim()) {
        await this.baileys.sendText(tenantId, from, result.reply.trim());
      }
    } catch (e) {
      this.logger.error('Message handling failed', e);
    }
  }
}

