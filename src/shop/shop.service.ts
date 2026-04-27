import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type ShopOrderItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
};

export type CreateShopOrderInput = {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  locationUrl?: string;
  notes?: string;
  items: ShopOrderItem[];
  total: number;
};

@Injectable()
export class ShopService {
  constructor(private readonly prisma: PrismaService) {}

  async getStore(slug: string) {
    const normalizedSlug = slug.trim();
    if (!normalizedSlug) {
      throw new NotFoundException('Store not found');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: normalizedSlug },
      select: {
        id: true,
        name: true,
        botSettings: {
          select: {
            welcomeMessage: true,
            welcomeImages: true,
          },
        },
        products: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            imageUrls: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Store not found');
    }

    return {
      storeName: tenant.name ?? 'المتجر',
      welcomeMessage: tenant.botSettings?.welcomeMessage ?? '',
      welcomeImages: tenant.botSettings?.welcomeImages ?? [],
      products: tenant.products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? '',
        price: p.price,
        imageUrl: p.imageUrls?.[0] ?? '',
        imageUrls: p.imageUrls ?? [],
      })),
    };
  }

  async createOrder(slug: string, input: CreateShopOrderInput) {
    const normalizedSlug = slug.trim();
    if (!normalizedSlug) {
      throw new NotFoundException('Store not found');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: normalizedSlug },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException('Store not found');
    }

    const customerName = input.customerName?.trim();
    const customerPhone = input.customerPhone?.trim();
    const customerAddress = input.customerAddress?.trim();
    const items = Array.isArray(input.items) ? input.items : [];

    if (!customerName || !customerPhone || !customerAddress) {
      throw new BadRequestException('Customer name, phone, and address are required');
    }
    if (items.length === 0) {
      throw new BadRequestException('Order items are required');
    }

    const normalizedItems = items
      .map((item) => ({
        productId: String(item.productId ?? '').trim(),
        name: String(item.name ?? '').trim(),
        price: Number(item.price),
        quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
      }))
      .filter(
        (item) =>
          item.productId &&
          item.name &&
          Number.isFinite(item.price) &&
          item.price >= 0,
      );

    if (normalizedItems.length === 0) {
      throw new BadRequestException('Valid order items are required');
    }

    const calculatedTotal = normalizedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const total = Number.isFinite(Number(input.total))
      ? Number(input.total)
      : calculatedTotal;

    const order = await this.prisma.order.create({
      data: {
        tenantId: tenant.id,
        customerName,
        customerPhone,
        customerAddress,
        locationUrl: input.locationUrl?.trim() || null,
        notes: input.notes?.trim() || null,
        items: normalizedItems as Prisma.InputJsonValue,
        total,
        status: 'pending',
        sourcePhone: customerPhone,
      },
      select: { id: true },
    });

    return { success: true, orderId: order.id };
  }
}

