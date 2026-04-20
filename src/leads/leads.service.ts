import { Injectable, NotFoundException } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/** Includes `id` so clients can call `PATCH /leads/:id` after listing. */
const leadListSelect = {
  id: true,
  name: true,
  phone: true,
  interest: true,
  status: true,
  createdAt: true,
} satisfies Prisma.LeadSelect;

export type LeadListItem = Prisma.LeadGetPayload<{
  select: typeof leadListSelect;
}>;

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  findAllByTenant(tenantId: string): Promise<LeadListItem[]> {
    return this.prisma.lead.findMany({
      where: { tenantId },
      select: leadListSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: LeadStatus,
  ): Promise<LeadListItem> {
    const existing = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Lead not found');
    }
    try {
      return await this.prisma.lead.update({
        where: { id },
        data: { status },
        select: leadListSelect,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException('Lead not found');
      }
      throw e;
    }
  }
}
