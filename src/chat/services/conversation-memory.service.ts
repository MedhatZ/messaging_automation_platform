import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { EmbeddingVector } from './embeddings.service';
import { EmbeddingsService } from './embeddings.service';

export type MemoryRole = 'user' | 'assistant';

export type MemoryItem = {
  id: string;
  role: MemoryRole;
  messageText: string;
  timestamp: Date;
  embedding: EmbeddingVector | null;
};

export type MemorySearchResult = Omit<MemoryItem, 'embedding'> & {
  similarity: number | null;
};

function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : -1;
}

@Injectable()
export class ConversationMemoryService {
  private readonly logger = new Logger(ConversationMemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  /**
   * Save a single message to semantic memory (best-effort embedding).
   * Always scopes by tenantId to prevent cross-tenant leakage.
   */
  async saveMessage(input: {
    tenantId: string;
    conversationId: string;
    role: MemoryRole;
    messageText: string;
    timestamp?: Date;
  }): Promise<void> {
    const messageText = (input.messageText ?? '').toString().trim();
    if (!messageText) return;

    const embedding = await this.embeddings.embed(messageText);
    const ts = input.timestamp ?? new Date();

    try {
      await this.prisma.conversationMemory.create({
        data: {
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          role: input.role,
          messageText,
          ...(embedding && {
            embedding: embedding as unknown as Prisma.InputJsonValue,
          }),
          timestamp: ts,
        },
        select: { id: true },
      });
    } catch (e) {
      // Ignore duplicate unique(conversationId, timestamp) collisions
      // and other best-effort errors (memory should not break chat).
      this.logger.warn(
        `saveMessage failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return;
    }

    await this.cleanupOldMemories({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      keepLast: 30,
    });
  }

  /**
   * Returns a short relevant context list for the current user message.
   * If embeddings are unavailable, falls back to most recent memories.
   */
  async getRelevantContext(input: {
    tenantId: string;
    conversationId: string;
    messageText: string;
    take?: number;
  }): Promise<{ role: MemoryRole; content: string }[]> {
    const take = Math.min(20, Math.max(1, input.take ?? 6));
    const query = (input.messageText ?? '').toString().trim();
    if (!query) return [];

    const queryEmbedding = await this.embeddings.embed(query);

    const rows = await this.prisma.conversationMemory.findMany({
      where: { tenantId: input.tenantId, conversationId: input.conversationId },
      orderBy: { timestamp: 'desc' },
      take: 80,
      select: {
        id: true,
        role: true,
        messageText: true,
        timestamp: true,
        embedding: true,
      },
    });

    if (!queryEmbedding) {
      return rows
        .slice(0, take)
        .reverse()
        .map((r) => ({
          role: (r.role === 'assistant' ? 'assistant' : 'user') as MemoryRole,
          content: r.messageText,
        }));
    }

    const scored = rows
      .map((r) => {
        const emb = r.embedding as unknown as EmbeddingVector | null;
        const sim =
          emb && Array.isArray(emb) ? cosineSimilarity(queryEmbedding, emb) : -1;
        return { r, sim };
      })
      .sort((a, b) => b.sim - a.sim)
      .slice(0, take)
      .map(({ r }) => ({
        role: (r.role === 'assistant' ? 'assistant' : 'user') as MemoryRole,
        content: r.messageText,
      }));

    return scored;
  }

  /**
   * Semantic search across a tenant's memories (optionally within one conversation).
   */
  async searchMemories(input: {
    tenantId: string;
    query: string;
    conversationId?: string;
    take?: number;
  }): Promise<MemorySearchResult[]> {
    const take = Math.min(50, Math.max(1, input.take ?? 10));
    const query = (input.query ?? '').toString().trim();
    if (!query) return [];

    const queryEmbedding = await this.embeddings.embed(query);

    const rows = await this.prisma.conversationMemory.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.conversationId && { conversationId: input.conversationId }),
      },
      orderBy: { timestamp: 'desc' },
      take: 200,
      select: {
        id: true,
        role: true,
        messageText: true,
        timestamp: true,
        embedding: true,
      },
    });

    const mapped: MemoryItem[] = rows.map((r) => ({
      id: r.id,
      role: (r.role === 'assistant' ? 'assistant' : 'user') as MemoryRole,
      messageText: r.messageText,
      timestamp: r.timestamp,
      embedding: (r.embedding as unknown as EmbeddingVector | null) ?? null,
    }));

    if (!queryEmbedding) {
      // Fallback: naive keyword filter
      const q = query.toLowerCase();
      return mapped
        .filter((m) => m.messageText.toLowerCase().includes(q))
        .slice(0, take)
        .map((m) => ({
          id: m.id,
          role: m.role,
          messageText: m.messageText,
          timestamp: m.timestamp,
          similarity: null,
        }));
    }

    return mapped
      .map((m) => {
        const sim =
          m.embedding && Array.isArray(m.embedding)
            ? cosineSimilarity(queryEmbedding, m.embedding)
            : -1;
        return { m, sim };
      })
      .sort((a, b) => b.sim - a.sim)
      .slice(0, take)
      .map(({ m, sim }) => ({
        id: m.id,
        role: m.role,
        messageText: m.messageText,
        timestamp: m.timestamp,
        similarity: sim,
      }));
  }

  async clearConversationMemory(input: {
    tenantId: string;
    conversationId: string;
  }): Promise<{ deleted: number }> {
    // Ensure conversation belongs to tenant (avoid leaking existence across tenants).
    const conv = await this.prisma.conversation.findFirst({
      where: { id: input.conversationId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    const res = await this.prisma.conversationMemory.deleteMany({
      where: { tenantId: input.tenantId, conversationId: input.conversationId },
    });
    return { deleted: res.count };
  }

  async getMemoryStats(input: {
    tenantId: string;
    conversationId: string;
  }): Promise<{ count: number; oldest: Date | null; newest: Date | null }> {
    const agg = await this.prisma.conversationMemory.aggregate({
      where: { tenantId: input.tenantId, conversationId: input.conversationId },
      _count: { _all: true },
      _min: { timestamp: true },
      _max: { timestamp: true },
    });
    return {
      count: agg._count._all,
      oldest: agg._min.timestamp ?? null,
      newest: agg._max.timestamp ?? null,
    };
  }

  /**
   * Keeps only the last N messages (by timestamp) for a conversation.
   */
  async cleanupOldMemories(input: {
    tenantId: string;
    conversationId: string;
    keepLast?: number;
  }): Promise<void> {
    const keepLast = Math.min(200, Math.max(1, input.keepLast ?? 30));

    const newestToOldest = await this.prisma.conversationMemory.findMany({
      where: { tenantId: input.tenantId, conversationId: input.conversationId },
      orderBy: { timestamp: 'desc' },
      select: { id: true },
      skip: keepLast,
      take: 5000,
    });

    if (newestToOldest.length === 0) return;

    const ids = newestToOldest.map((r) => r.id);
    await this.prisma.conversationMemory.deleteMany({
      where: { tenantId: input.tenantId, id: { in: ids } },
    });
  }
}

