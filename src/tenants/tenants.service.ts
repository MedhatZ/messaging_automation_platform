import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(): Promise<{ id: string }> {
    const tenant = await this.prisma.tenant.create({ data: {} });
    return { id: tenant.id };
  }
}
