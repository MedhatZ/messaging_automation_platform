import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/jwt-access-payload.interface';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('settings')
  @UseGuards(JwtAuthGuard)
  getSettings(@CurrentUser() user: JwtAccessPayload) {
    return this.tenantsService.getSettings(user.tenantId);
  }

  @Patch('settings')
  @UseGuards(JwtAuthGuard)
  updateSettings(
    @CurrentUser() user: JwtAccessPayload,
    @Body()
    body: {
      storeName?: string;
      slug?: string;
      welcomeMessage?: string;
      welcomeImages?: string[];
      welcomeVideos?: string[];
    },
  ) {
    return this.tenantsService.updateSettings(user.tenantId, body);
  }

  @Post('create')
  create() {
    return this.tenantsService.create();
  }
}
