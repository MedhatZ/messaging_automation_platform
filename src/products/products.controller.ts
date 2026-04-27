import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtAccessPayload } from '../auth/jwt-access-payload.interface';
import { ClientTenantGuard } from '../auth/guards/client-tenant.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';
import { ProductTrackingService } from './services/product-tracking.service';

@Controller('products')
@UseGuards(JwtAuthGuard, ClientTenantGuard)
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly tracking: ProductTrackingService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.productsService.create(dto, user.tenantId);
  }

  @Get()
  findAll(@CurrentUser() user: JwtAccessPayload) {
    return this.productsService.findAllByTenant(user.tenantId);
  }

  @Get('recommendations/:conversationId')
  async recommendations(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    const recs = await this.tracking.getRecommendationsForCustomer(
      user.tenantId,
      conversationId,
      5,
    );
    const ids = recs.map((r) => r.productId);
    const products = await this.productsService.findAllByTenant(user.tenantId);
    const byId = new Map(products.map((p) => [p.id, p]));

    return recs
      .map((r) => {
        const p = byId.get(r.productId);
        if (!p) return null;
        const imageUrl = Array.isArray(p.imageUrls) ? p.imageUrls[0] : null;
        return {
          productId: p.id,
          name: p.name,
          price: p.price,
          imageUrl: imageUrl ? imageUrl.trim() : null,
          score: r.score,
          reason: r.reason,
        };
      })
      .filter(Boolean);
  }

  @Get('affinity/:productId')
  async affinity(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    const affinity = await this.tracking.getProductAffinity(user.tenantId, productId);
    return {
      productId,
      totalMentions: affinity?.totalMentions ?? 0,
      totalOrders: affinity?.totalOrders ?? 0,
      conversionRate: affinity?.conversionRate ?? 0,
      updatedAt: affinity?.updatedAt ?? null,
    };
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.productsService.findOne(id, user.tenantId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.productsService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.productsService.remove(id, user.tenantId);
  }
}
