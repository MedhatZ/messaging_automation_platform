import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { CreateShopOrderInput } from './shop.service';
import { ShopService } from './shop.service';

@Controller(['shop', 'api/shop'])
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get(':slug')
  getStore(@Param('slug') slug: string) {
    return this.shopService.getStore(slug);
  }

  @Post(':slug/order')
  createOrder(
    @Param('slug') slug: string,
    @Body() body: CreateShopOrderInput,
  ) {
    return this.shopService.createOrder(slug, body);
  }
}

