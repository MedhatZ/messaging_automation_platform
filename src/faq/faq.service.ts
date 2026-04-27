import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../database/prisma.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';

@Injectable()
export class FaqService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async create(dto: CreateFaqDto, tenantId: string) {
    try {
      const created = await this.prisma.faq.create({
        data: {
          tenantId,
          questionAr: dto.questionAr,
          questionEn: dto.questionEn ?? '',
          answerAr: dto.answerAr,
          answerEn: dto.answerEn ?? '',
          keywordsAr: dto.keywordsAr ?? [],
          keywordsEn: dto.keywordsEn ?? [],
          isActive: dto.isActive ?? true,
          priority: dto.priority ?? 0,
        },
      });
      await this.cache.del(`faqs:${tenantId}`);
      return created;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new BadRequestException('Invalid tenantId');
      }
      throw e;
    }
  }

  findAllByTenant(tenantId: string) {
    return this.prisma.faq.findMany({
      where: { tenantId, isActive: true },
      orderBy: { priority: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const faq = await this.prisma.faq.findFirst({ where: { id, tenantId } });
    if (!faq) {
      throw new NotFoundException('FAQ not found');
    }
    return faq;
  }

  async update(id: string, tenantId: string, dto: UpdateFaqDto) {
    await this.ensureExists(id, tenantId);
    const data: Prisma.FaqUpdateInput = {
      ...(dto.questionAr !== undefined && { questionAr: dto.questionAr }),
      ...(dto.questionEn !== undefined && { questionEn: dto.questionEn }),
      ...(dto.answerAr !== undefined && { answerAr: dto.answerAr }),
      ...(dto.answerEn !== undefined && { answerEn: dto.answerEn }),
      ...(dto.keywordsAr !== undefined && { keywordsAr: dto.keywordsAr }),
      ...(dto.keywordsEn !== undefined && { keywordsEn: dto.keywordsEn }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.priority !== undefined && { priority: dto.priority }),
    };
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    try {
      const updated = await this.prisma.faq.update({
        where: { id },
        data,
      });
      await this.cache.del(`faqs:${tenantId}`);
      return updated;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException('FAQ not found');
      }
      throw e;
    }
  }

  async remove(id: string, tenantId: string) {
    await this.ensureExists(id, tenantId);
    await this.prisma.faq.delete({ where: { id } });
    await this.cache.del(`faqs:${tenantId}`);
    return { id, deleted: true };
  }

  private async ensureExists(id: string, tenantId: string): Promise<void> {
    const count = await this.prisma.faq.count({ where: { id, tenantId } });
    if (count === 0) {
      throw new NotFoundException('FAQ not found');
    }
  }
}
