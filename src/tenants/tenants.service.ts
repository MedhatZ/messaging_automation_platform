import { BadRequestException, Injectable } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getSettings(tenantId: string) {
    const row = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        slug: true,
        botSettings: {
          select: {
            welcomeMessage: true,
            welcomeImages: true,
            welcomeVideos: true,
          },
        },
      },
    });

    return {
      storeName: row?.name ?? '',
      slug: row?.slug ?? '',
      welcomeMessage: row?.botSettings?.welcomeMessage ?? '',
      welcomeImages: row?.botSettings?.welcomeImages ?? [],
      welcomeVideos: row?.botSettings?.welcomeVideos ?? [],
    };
  }

  async updateSettings(
    tenantId: string,
    input: {
      storeName?: string;
      slug?: string;
      welcomeMessage?: string;
      welcomeImages?: string[];
      welcomeVideos?: string[];
    },
  ) {
    const storeName =
      typeof input.storeName === 'string' ? input.storeName.trim() : undefined;
    const slug = typeof input.slug === 'string' ? input.slug.trim() : undefined;
    const welcomeMessage =
      typeof input.welcomeMessage === 'string'
        ? input.welcomeMessage.trim()
        : undefined;
    const welcomeImages = Array.isArray(input.welcomeImages)
      ? input.welcomeImages
          .map((u) => (typeof u === 'string' ? u.trim() : ''))
          .filter(Boolean)
          .slice(0, 20)
      : undefined;
    const welcomeVideos = Array.isArray(input.welcomeVideos)
      ? input.welcomeVideos
          .map((u) => (typeof u === 'string' ? u.trim() : ''))
          .filter(Boolean)
          .slice(0, 10)
      : undefined;

    if (slug != null && slug.length > 0) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) {
        throw new BadRequestException(
          'Invalid slug. Use letters/numbers and dashes only.',
        );
      }
    }

    try {
      const updated = await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          ...(storeName != null ? { name: storeName || null } : {}),
          ...(slug != null ? { slug: slug || null } : {}),
          botSettings: {
            upsert: {
              update: {
                ...(welcomeMessage != null ? { welcomeMessage } : {}),
                ...(welcomeImages != null ? { welcomeImages } : {}),
                ...(welcomeVideos != null ? { welcomeVideos } : {}),
              },
              create: {
                ...(welcomeMessage != null ? { welcomeMessage } : {}),
                ...(welcomeImages != null ? { welcomeImages } : {}),
                ...(welcomeVideos != null ? { welcomeVideos } : {}),
              },
            },
          },
        },
        include: {
          botSettings: {
            select: {
              welcomeMessage: true,
              welcomeImages: true,
              welcomeVideos: true,
            },
          },
        },
      });

      // Invalidate per-user welcome cache for this tenant so new customers get updated welcome assets.
      void this.cache.deleteByPattern(`welcome_sent:${tenantId}:*`);

      return {
        storeName: updated.name ?? '',
        slug: updated.slug ?? '',
        welcomeMessage: updated.botSettings?.welcomeMessage ?? '',
        welcomeImages: updated.botSettings?.welcomeImages ?? [],
        welcomeVideos: updated.botSettings?.welcomeVideos ?? [],
      };
    } catch (e: any) {
      // Prisma unique constraint
      if (e?.code === 'P2002') {
        throw new BadRequestException('Slug already exists.');
      }
      throw e;
    }
  }

  async create(): Promise<{ id: string }> {
    const tenant = await this.prisma.tenant.create({ data: {} });
    return { id: tenant.id };
  }
}
