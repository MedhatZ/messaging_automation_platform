import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async create(dto: CreateProductDto, tenantId: string) {
    try {
      const created = await this.prisma.product.create({
        data: {
          tenantId,
          name: dto.name,
          description: dto.description,
          price: dto.price,
          imageUrls: dto.imageUrls ?? [],
          keywords: dto.keywords ?? [],
          isActive: dto.isActive ?? true,
        },
      });
      await this.cache.del(`products:${tenantId}`);
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
    return this.prisma.product.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async update(id: string, tenantId: string, dto: UpdateProductDto) {
    await this.ensureExists(id, tenantId);
    const data: Prisma.ProductUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.price !== undefined && { price: dto.price }),
      ...(dto.imageUrls !== undefined && { imageUrls: dto.imageUrls }),
      ...(dto.keywords !== undefined && { keywords: dto.keywords }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    };
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    try {
      const updated = await this.prisma.product.update({
        where: { id },
        data,
      });
      await this.cache.del(`products:${tenantId}`);
      return updated;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException('Product not found');
      }
      throw e;
    }
  }

  async remove(id: string, tenantId: string) {
    await this.ensureExists(id, tenantId);
    await this.prisma.product.delete({ where: { id } });
    await this.cache.del(`products:${tenantId}`);
    return { id, deleted: true };
  }

  private async ensureExists(id: string, tenantId: string): Promise<void> {
    const count = await this.prisma.product.count({ where: { id, tenantId } });
    if (count === 0) {
      throw new NotFoundException('Product not found');
    }
  }
}
