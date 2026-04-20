import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AdminService,
  type CreateTenantResult,
  type ResetClientPasswordResult,
} from './admin.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { CreateWhatsappAccountDto } from './dto/create-whatsapp-account.dto';
import { ResetClientPasswordDto } from './dto/reset-client-password.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('tenants')
  createTenant(@Body() dto: CreateTenantDto): Promise<CreateTenantResult> {
    return this.adminService.createTenant(dto);
  }

  @Post('whatsapp-accounts')
  createWhatsappAccount(@Body() dto: CreateWhatsappAccountDto) {
    return this.adminService.createWhatsappAccount(dto);
  }

  @Get('tenants')
  listTenants() {
    return this.adminService.listTenants();
  }

  @Patch('tenants/:id/toggle')
  toggleTenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.toggleTenantActive(id);
  }

  @Patch('tenants/:id/extend')
  extendTenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.extendSubscription(id);
  }

  @Patch('users/:id/reset-password')
  resetClientPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetClientPasswordDto,
  ): Promise<ResetClientPasswordResult> {
    return this.adminService.resetClientPassword(id, dto.newPassword);
  }
}
