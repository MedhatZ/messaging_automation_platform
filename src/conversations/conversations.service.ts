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
}
