import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { WhatsappSendProducer } from '../queues/whatsapp-send/whatsapp-send.producer';

export type BroadcastFilter = 'all' | 'new' | 'interested' | 'hot';

export type BroadcastInput = {
  tenantId: string;
  message: string;
  filter: BroadcastFilter;
  delayBetweenMs?: number; // تأخير بين كل رسالة، افتراضي 500ms
};

export type BroadcastResult = {
  total: number;
  queued: number;
  skipped: number;
};

const DEFAULT_DELAY_BETWEEN_MS = 2000;
const BROADCAST_BATCH_SIZE = 500;
const BROADCAST_MAX_TOTAL = 10_000;

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly producer: WhatsappSendProducer,
  ) {}

  async send(input: BroadcastInput): Promise<BroadcastResult> {
    const delayBetween = input.delayBetweenMs ?? DEFAULT_DELAY_BETWEEN_MS;

    // جيب الـ WhatsApp account للـ tenant
    const waAccount = await this.prisma.whatsappAccount.findFirst({
      where: { tenantId: input.tenantId, status: 'active' },
      select: { id: true },
    });

    if (!waAccount) {
      this.logger.warn(`No active WhatsApp account for tenant=${input.tenantId}`);
      return { total: 0, queued: 0, skipped: 0 };
    }

    // جيب المحادثات حسب الفلتر
    const whereClause: Record<string, unknown> = {
      tenantId: input.tenantId,
    };

    if (input.filter !== 'all') {
      whereClause.leadStatus = input.filter;
    }

    const totalAll = await this.prisma.conversation.count({
      where: whereClause,
    });

    if (totalAll > BROADCAST_MAX_TOTAL) {
      this.logger.warn(
        `Broadcast capped at ${BROADCAST_MAX_TOTAL} conversations (requested=${totalAll}) tenant=${input.tenantId} filter=${input.filter}`,
      );
    }

    const total = Math.min(totalAll, BROADCAST_MAX_TOTAL);
    let queued = 0;
    let skipped = 0;

    let offset = 0;
    while (offset < total) {
      const take = Math.min(BROADCAST_BATCH_SIZE, total - offset);
      const conversations = await this.prisma.conversation.findMany({
        where: whereClause,
        select: { id: true, externalUserId: true },
        orderBy: { lastMessageAt: 'desc' },
        skip: offset,
        take,
      });

      if (conversations.length === 0) break;

      for (let i = 0; i < conversations.length; i++) {
        const conv = conversations[i];
        const idx = offset + i;
        try {
          await this.producer.enqueueText(
            {
              tenantId: input.tenantId,
              whatsappAccountId: waAccount.id,
              to: conv.externalUserId,
              message: input.message,
            },
            { delayMs: idx * delayBetween }, // تأخير تدريجي عشان ما نتحجمش من Meta
          );
          queued++;
        } catch (e) {
          this.logger.warn(
            `Broadcast skip conversation=${conv.id}: ${e instanceof Error ? e.message : String(e)}`,
          );
          skipped++;
        }
      }

      offset += conversations.length;
      if (conversations.length < take) break;
    }

    this.logger.log(
      `Broadcast done tenant=${input.tenantId} filter=${input.filter} total=${total} queued=${queued} skipped=${skipped}`,
    );

    return { total, queued, skipped };
  }
}

