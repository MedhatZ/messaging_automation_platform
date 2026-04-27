import { Injectable, NotFoundException } from '@nestjs/common';
import { MessageDirection } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type ConversationListItem = {
  id: string;
  externalUserName: string | null;
  externalUserId: string;
  lastMessageAt: Date | null;
  lastMessageContent: string | null;
};

export type ConversationMessageItem = {
  id: string;
  direction: MessageDirection;
  content: string;
  createdAt: Date;
};

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForTenant(tenantId: string): Promise<ConversationListItem[]> {
    const rows = await this.prisma.conversation.findMany({
      where: { tenantId },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        externalUserId: true,
        externalUserName: true,
        lastMessageAt: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true },
        },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      externalUserName: r.externalUserName,
      externalUserId: r.externalUserId,
      lastMessageAt: r.lastMessageAt,
      lastMessageContent: r.messages[0]?.content ?? null,
    }));
  }

  async findMessagesForConversation(
    conversationId: string,
    tenantId: string,
  ): Promise<ConversationMessageItem[]> {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      select: { id: true },
    });
    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }

    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        direction: true,
        content: true,
        createdAt: true,
      },
    });
  }

  async getStats(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [total, byStatus, todayCount, topProducts] = await Promise.all([
      this.prisma.conversation.count({ where: { tenantId } }),

      this.prisma.conversation.groupBy({
        by: ['leadStatus'],
        where: { tenantId },
        _count: { _all: true },
      }),

      this.prisma.conversation.count({
        where: { tenantId, lastMessageAt: { gte: today } },
      }),

      this.prisma.productView.groupBy({
        by: ['productId'],
        where: { tenantId },
        _count: { productId: true },
        orderBy: { _count: { productId: 'desc' } },
        take: 5,
      }),
    ]);

    const statusMap = Object.fromEntries(
      byStatus.map((s) => [s.leadStatus, s._count._all]),
    ) as Record<string, number>;

    const productIds = topProducts.map((p) => p.productId);
    const productRows =
      productIds.length === 0
        ? []
        : await this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true },
          });
    const productNameMap = Object.fromEntries(
      productRows.map((p) => [p.id, p.name]),
    ) as Record<string, string>;

    return {
      total,
      new: statusMap['new'] ?? 0,
      interested: statusMap['interested'] ?? 0,
      hot: statusMap['hot'] ?? 0,
      today: todayCount,
      topProducts: topProducts.map((p) => ({
        name: productNameMap[p.productId] ?? p.productId,
        count: p._count.productId,
      })),
    };
  }
}
