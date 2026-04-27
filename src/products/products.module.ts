import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductTrackingService } from './services/product-tracking.service';

@Module({
  imports: [AuthModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductTrackingService],
  exports: [ProductTrackingService],
})
export class ProductsModule {}
