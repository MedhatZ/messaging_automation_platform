import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WhatsappSendProducer } from '../../queues/whatsapp-send/whatsapp-send.producer';

const FOLLOW_UP_DELAY_MS = 24 * 60 * 60 * 1000; // 24 ساعة

const FOLLOW_UP_MESSAGES = [
  'مرحباً 👋 لسه عندنا منتجات رائعة، تحب تشوف إيه عندنا؟ 😊',
  'هلو! مش عايز تفوّت عروضنا الحلوة 🎁 تحب أعرفك بأحسن المنتجات عندنا؟',
  'أهلاً! لو في أي سؤال أنا هنا دايماً 😊',
];

@Injectable()
export class FollowUpService {
  private readonly logger = new Logger(FollowUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly producer: WhatsappSendProducer,
  ) {}

  /**
   * يتبعت بعد كل رسالة من الـ AI أو الـ Product branch.
   * لو العميل مردش خلال 24 ساعة، يبعتله follow-up.
   */
  async scheduleFollowUp(input: {
    tenantId: string;
    conversationId: string;
    externalUserId: string;
    whatsappAccountId: string;
  }): Promise<void> {
    try {
      // جيب آخر follow-up اتبعت عشان منكررش
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: input.conversationId },
        select: { lastFollowUpAt: true, lastMessageAt: true },
      });

      if (!conversation) return;

      // لو في follow-up اتبعت في آخر 24 ساعة، متبعتش تاني
      if (conversation.lastFollowUpAt) {
        const hoursSinceFollowUp =
          (Date.now() - conversation.lastFollowUpAt.getTime()) /
          (1000 * 60 * 60);
        if (hoursSinceFollowUp < 24) return;
      }

      // اختار رسالة عشوائية من القائمة
      const message =
        FOLLOW_UP_MESSAGES[Math.floor(Math.random() * FOLLOW_UP_MESSAGES.length)];

      // حط الـ job في الـ queue بـ delay 24 ساعة
      await this.producer.enqueueText(
        {
          tenantId: input.tenantId,
          whatsappAccountId: input.whatsappAccountId,
          to: input.externalUserId,
          message,
          followUp: {
            conversationId: input.conversationId,
            scheduledAt: new Date().toISOString(),
          },
        },
        { delayMs: FOLLOW_UP_DELAY_MS },
      );

      // سجل إن follow-up اتجدول
      await this.prisma.conversation.update({
        where: { id: input.conversationId },
        data: { lastFollowUpAt: new Date() },
      });

      this.logger.log(
        `Follow-up scheduled for conversation=${input.conversationId}`,
      );
    } catch (e) {
      this.logger.warn(
        `Follow-up schedule failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

