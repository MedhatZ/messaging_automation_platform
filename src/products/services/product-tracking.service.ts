import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type ProductAffinity } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

type RecommendationItem = {
  productId: string;
  score: number;
  reason: string;
};

@Injectable()
export class ProductTrackingService {
  private readonly logger = new Logger(ProductTrackingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async trackProductView(data: {
    tenantId: string;
    conversationId: string;
    productId: string;
    viewDuration?: number;
    mentionedInChat?: boolean;
  }): Promise<void> {
    const viewDuration = Math.max(0, Number(data.viewDuration ?? 0) || 0);
    const mentionedInChat = data.mentionedInChat ?? true;

    const [conv, product] = await Promise.all([
      this.prisma.conversation.findFirst({
        where: { id: data.conversationId, tenantId: data.tenantId },
        select: { id: true },
      }),
      this.prisma.product.findFirst({
        where: { id: data.productId, tenantId: data.tenantId },
        select: { id: true, keywords: true },
      }),
    ]);
    if (!conv) throw new NotFoundException('Conversation not found');
    if (!product) throw new NotFoundException('Product not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.productView.upsert({
        where: {
          conversationId_productId: {
            conversationId: data.conversationId,
            productId: data.productId,
          },
        },
        create: {
          tenantId: data.tenantId,
          conversationId: data.conversationId,
          productId: data.productId,
          viewDuration,
          mentionedInChat,
        },
        update: {
          viewDuration: { increment: viewDuration },
          mentionedInChat: mentionedInChat ? true : undefined,
        },
      });

      await tx.productAffinity.upsert({
        where: {
          tenantId_productId: { tenantId: data.tenantId, productId: data.productId },
        },
        create: {
          tenantId: data.tenantId,
          productId: data.productId,
          associatedKeywords: product.keywords ?? [],
          totalMentions: 1,
          totalOrders: 0,
          conversionRate: 0,
        },
        update: {
          totalMentions: { increment: 1 },
          // Keep keywords fresh but avoid overwriting with empty.
          ...(Array.isArray(product.keywords) && product.keywords.length > 0
            ? { associatedKeywords: product.keywords }
            : {}),
        },
      });
    });
  }

  async trackOrderPlaced(
    tenantId: string,
    conversationId: string,
    productId: string,
  ): Promise<void> {
    const [conv, product] = await Promise.all([
      this.prisma.conversation.findFirst({
        where: { id: conversationId, tenantId },
        select: { id: true },
      }),
      this.prisma.product.findFirst({
        where: { id: productId, tenantId },
        select: { id: true, keywords: true },
      }),
    ]);
    if (!conv) throw new NotFoundException('Conversation not found');
    if (!product) throw new NotFoundException('Product not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.productView.upsert({
        where: {
          conversationId_productId: { conversationId, productId },
        },
        create: {
          tenantId,
          conversationId,
          productId,
          viewDuration: 0,
          mentionedInChat: true,
          orderPlaced: true,
        },
        update: {
          orderPlaced: true,
        },
      });

      const affinity = await tx.productAffinity.upsert({
        where: { tenantId_productId: { tenantId, productId } },
        create: {
          tenantId,
          productId,
          associatedKeywords: product.keywords ?? [],
          totalMentions: 0,
          totalOrders: 1,
          conversionRate: 0,
        },
        update: {
          totalOrders: { increment: 1 },
        },
        select: { totalOrders: true, totalMentions: true },
      });

      const conversionRate =
        affinity.totalMentions > 0 ? affinity.totalOrders / affinity.totalMentions : 0;
      await tx.productAffinity.update({
        where: { tenantId_productId: { tenantId, productId } },
        data: { conversionRate },
      });
    });
  }

  getProductAffinity(tenantId: string, productId: string): Promise<ProductAffinity | null> {
    return this.prisma.productAffinity.findFirst({
      where: { tenantId, productId },
    });
  }

  async updateAllAffinityScores(tenantId: string): Promise<{ updated: number }> {
    const rows = await this.prisma.productAffinity.findMany({
      where: { tenantId },
      select: { productId: true, totalOrders: true, totalMentions: true },
    });

    await this.prisma.$transaction(
      rows.map((r) =>
        this.prisma.productAffinity.update({
          where: { tenantId_productId: { tenantId, productId: r.productId } },
          data: {
            conversionRate:
              r.totalMentions > 0 ? r.totalOrders / r.totalMentions : 0,
          },
        }),
      ),
    );
    return { updated: rows.length };
  }

  async getFrequentlyBoughtTogether(
    tenantId: string,
    productId: string,
    limit = 5,
  ): Promise<{ productId: string; count: number }[]> {
    const lim = Math.min(20, Math.max(1, limit));

    const convs = await this.prisma.productView.findMany({
      where: { tenantId, productId, orderPlaced: true },
      select: { conversationId: true },
      take: 500,
    });
    const conversationIds = Array.from(new Set(convs.map((c) => c.conversationId)));
    if (conversationIds.length === 0) return [];

    const grouped = await this.prisma.productView.groupBy({
      by: ['productId'],
      where: {
        tenantId,
        conversationId: { in: conversationIds },
        orderPlaced: true,
        productId: { not: productId },
      },
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
      take: lim,
    });

    return grouped.map((g) => ({
      productId: g.productId,
      count: g._count.productId,
    }));
  }

  async getRecommendationsForCustomer(
    tenantId: string,
    conversationId: string,
    limit = 5,
  ): Promise<RecommendationItem[]> {
    const lim = Math.min(20, Math.max(1, limit));

    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      select: { id: true },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    const viewed = await this.prisma.productView.findMany({
      where: { tenantId, conversationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { productId: true },
    });
    const viewedIds = Array.from(new Set(viewed.map((v) => v.productId)));

    const recMap = new Map<string, RecommendationItem>();

    // 1) Frequently bought together with viewed products
    for (const pid of viewedIds.slice(0, 5)) {
      const together = await this.getFrequentlyBoughtTogether(tenantId, pid, 5);
      for (const t of together) {
        const existing = recMap.get(t.productId);
        const score = Math.min(1, 0.6 + t.count / 10);
        const item: RecommendationItem = {
          productId: t.productId,
          score: existing ? Math.max(existing.score, score) : score,
          reason: 'Frequently bought together',
        };
        recMap.set(t.productId, item);
      }
    }

    // 2) Similar products by shared keywords (using ProductAffinity.associatedKeywords)
    if (viewedIds.length > 0) {
      const affinities = await this.prisma.productAffinity.findMany({
        where: { tenantId, productId: { in: viewedIds } },
        select: { associatedKeywords: true },
        take: 20,
      });
      const keywords = Array.from(
        new Set(
          affinities
            .flatMap((a) => a.associatedKeywords ?? [])
            .map((k) => (k ?? '').toString().trim().toLowerCase())
            .filter(Boolean),
        ),
      ).slice(0, 30);

      if (keywords.length > 0) {
        const similar = await this.prisma.product.findMany({
          where: {
            tenantId,
            isActive: true,
            id: { notIn: viewedIds },
            keywords: { hasSome: keywords },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true },
        });
        for (const s of similar) {
          if (!recMap.has(s.id)) {
            recMap.set(s.id, {
              productId: s.id,
              score: 0.55,
              reason: 'Similar to your interests',
            });
          }
        }
      }
    }

    // 3) Fallback: top products by conversionRate/mentions in tenant
    if (recMap.size < lim) {
      const top = await this.prisma.productAffinity.findMany({
        where: { tenantId },
        orderBy: [{ conversionRate: 'desc' }, { totalMentions: 'desc' }],
        take: 10,
        select: { productId: true, conversionRate: true, totalMentions: true },
      });
      for (const t of top) {
        if (recMap.size >= lim) break;
        if (viewedIds.includes(t.productId)) continue;
        if (recMap.has(t.productId)) continue;
        recMap.set(t.productId, {
          productId: t.productId,
          score: Math.min(1, 0.4 + (t.conversionRate ?? 0)),
          reason: 'Popular in your tenant',
        });
      }
    }

    const out = Array.from(recMap.values())
      .filter((r) => !viewedIds.includes(r.productId))
      .sort((a, b) => b.score - a.score)
      .slice(0, lim);

    return out;
  }
}

