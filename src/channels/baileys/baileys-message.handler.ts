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
      const waAccount = await this.prisma.whatsappAccount.findFirst({
        where: { tenantId, status: 'active' },
        select: { id: true },
      });

      // Ensure a conversation exists early so welcome messages can be persisted.
      const conversation = await this.chatService.findOrCreateConversation({
        tenantId,
        channelType: ChannelType.WHATSAPP,
        externalUserId: phone,
        externalUserName: undefined,
        whatsappAccountId: waAccount?.id,
      });

      // رسالة الترحيب لأول رسالة (based on message count, not just conversation presence)
      const messageCount = await this.prisma.message.count({
        where: { conversationId: conversation.id },
      });
      const isFirstMessage = messageCount === 0;

      if (isFirstMessage) {
        const settings = await this.prisma.botSettings.findUnique({
          where: { tenantId },
          select: { welcomeMessage: true, welcomeImages: true },
        });

        const welcomeText = String(settings?.welcomeMessage ?? '').trim();
        if (welcomeText) {
          await this.baileys.sendText(tenantId, from, welcomeText);
          await this.prisma.$transaction(async (tx) => {
            await this.chatService.saveOutgoingMessage(tx, conversation.id, welcomeText);
            await tx.conversation.update({
              where: { id: conversation.id },
              data: { lastMessageAt: new Date() },
            });
          });
          await new Promise((r) => setTimeout(r, 1000));
        }

        // ابعت الصور (لا نسجلها كرسالة نصية، لكن نسيبها outbound فقط)
        if (Array.isArray(settings?.welcomeImages)) {
          for (const img of settings.welcomeImages) {
            const imageUrl = String(img ?? '').trim();
            if (!imageUrl) continue;
            await this.baileys.sendImage(tenantId, from, imageUrl);
            await new Promise((r) => setTimeout(r, 1000));
          }
        }

        // ابعت رابط صفحة الشراء (ونسجله)
        if (tenant.slug) {
          const shopUrl = `https://messaging-automation-platform.vercel.app/shop.html?slug=${tenant.slug}`;
          const shopText = `🛒 تقدر تشوف منتجاتنا وتطلب من هنا:\n${shopUrl}`;
          await this.baileys.sendText(tenantId, from, shopText);
          await this.prisma.$transaction(async (tx) => {
            await this.chatService.saveOutgoingMessage(tx, conversation.id, shopText);
            await tx.conversation.update({
              where: { id: conversation.id },
              data: { lastMessageAt: new Date() },
            });
          });
          await new Promise((r) => setTimeout(r, 500));
        }
      }

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
              await this.baileys.sendImage(tenantId, from, p.imageUrl, `${p.name}\nالسعر: ${p.price} جنيه`);
              await new Promise((r) => setTimeout(r, 1000));
            }
          }
        }
        // ابعت الرد النصي
        await this.baileys.sendText(tenantId, from, result.reply);
      }
    } catch (e) {
      this.logger.error(
        `Message handling failed tenantId=${tenantId} from=${from}`,
        e instanceof Error ? e.stack : e,
      );
    }
  }
}

