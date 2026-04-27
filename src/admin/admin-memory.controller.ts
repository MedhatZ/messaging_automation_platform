import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PrismaService } from '../database/prisma.service';

@Controller('admin/memory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminMemoryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  async stats() {
    const totalMemories = await this.prisma.conversationMemory.count();

    const conversationsGrouped = await this.prisma.conversationMemory.groupBy({
      by: ['conversationId'],
      _count: { _all: true },
    });
    const totalConversationsWithMemory = conversationsGrouped.length;
    const avgMemoriesPerConversation =
      totalConversationsWithMemory > 0
        ? totalMemories / totalConversationsWithMemory
        : 0;

    const top = await this.prisma.conversationMemory.groupBy({
      by: ['tenantId'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    const tenantIds = top.map((t) => t.tenantId);
    const tenantRows = await this.prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true, email: true },
    });
    const tenantById = new Map(tenantRows.map((t) => [t.id, t]));

    const topTenantsByMemorySize = top.map((t) => ({
      tenantId: t.tenantId,
      name: tenantById.get(t.tenantId)?.name ?? null,
      email: tenantById.get(t.tenantId)?.email ?? null,
      memories: t._count.id,
    }));

    // memoryGrowthLast30Days: count per day for last 30 days (UTC-ish; DB timezone dependent)
    const rows = await this.prisma.$queryRaw<
      { day: Date; count: bigint }[]
    >(Prisma.sql`
      SELECT date_trunc('day', "timestamp") AS day, COUNT(*)::bigint AS count
      FROM "conversation_memories"
      WHERE "timestamp" >= NOW() - INTERVAL '30 days'
      GROUP BY day
      ORDER BY day ASC
    `);

    const memoryGrowthLast30Days = rows.map((r) => ({
      day: r.day.toISOString().slice(0, 10),
      count: Number(r.count),
    }));

    return {
      totalMemories,
      totalConversationsWithMemory,
      avgMemoriesPerConversation,
      topTenantsByMemorySize,
      memoryGrowthLast30Days,
    };
  }

  @Get('tenant/:tenantId')
  async tenantDetails(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    const totalMemories = await this.prisma.conversationMemory.count({
      where: { tenantId },
    });

    const conversations = await this.prisma.conversationMemory.groupBy({
      by: ['conversationId'],
      where: { tenantId },
      _count: { _all: true },
    });
    const conversationsCount = conversations.length;

    const recentMemories = await this.prisma.conversationMemory.findMany({
      where: { tenantId },
      orderBy: { timestamp: 'desc' },
      take: 10,
      select: {
        id: true,
        conversationId: true,
        role: true,
        messageText: true,
        timestamp: true,
      },
    });

    return {
      tenantId,
      totalMemories,
      conversationsCount,
      recentMemories,
    };
  }

  @Delete('tenant/:tenantId')
  async deleteTenantMemory(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    const res = await this.prisma.conversationMemory.deleteMany({
      where: { tenantId },
    });

    return { deleted: res.count };
  }
}

