import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { normalizeArabic } from '../../common/normalize-arabic';
import type { ProductCard } from './chat-decision.types';

const PRODUCT_INTENT = [
  // عربي — طلب مشاهدة
  'منتجات',
  'المنتجات',
  'عندكم إيه',
  'عندكم ايه',
  'عايز أشوف',
  'عايز اشوف',
  'عاوز أشوف',
  'عاوز اشوف',
  'إيه عندكم',
  'ايه عندكم',
  'فيه إيه',
  'فيه ايه',
  'اشوف المنتجات',
  'أشوف المنتجات',
  'القائمة',
  'الكتالوج',
  'صور المنتجات',
  'صور',
  // عربي — شراء/سعر
  'سعر',
  'الأسعار',
  'الاسعار',
  'بكام',
  'بكم',
  'كام سعر',
  'اشتري',
  'أشتري',
  'شراء',
  'عايز اطلب',
  'عاوز اطلب',
  // إنجليزي
  'show products',
  'catalog',
  'items',
  'products',
  'price',
  'prices',
  'buy',
  'order',
];

@Injectable()
export class ChatProductDecisionService {
  constructor(private readonly prisma: PrismaService) {}

  isProductIntent(message: string): boolean {
    const collapsed = message.trim().replace(/\s+/g, ' ');
    const en = collapsed.toLowerCase();
    const ar = normalizeArabic(collapsed);
    return PRODUCT_INTENT.some((k) => {
      const kn = k.toLowerCase().trim();
      if (!kn) return false;
      if (/[a-z]/i.test(kn)) return en.includes(kn);
      return ar.includes(normalizeArabic(kn));
    });
  }

  async fetchTopProducts(tenantId: string): Promise<ProductCard[]> {
    const rows = await this.prisma.product.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, price: true, imageUrls: true },
    });

    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      imageUrl: Array.isArray(p.imageUrls) ? p.imageUrls[0]?.trim() : undefined,
    }));
  }
}

