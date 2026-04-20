import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { CreateTenantWhatsappAccountDto } from './dto/create-tenant-whatsapp-account.dto';
import { UpdateTenantWhatsappAccountDto } from './dto/update-tenant-whatsapp-account.dto';
import { WhatsappAccountsService } from './whatsapp-accounts.service';

@Controller('whatsapp-accounts')
@UseGuards(JwtAuthGuard, ClientTenantGuard)
export class WhatsappAccountsController {
  constructor(private readonly whatsappAccounts: WhatsappAccountsService) {}

  @Get()
  list(@CurrentUser() user: JwtAccessPayload) {
    return this.whatsappAccounts.listForTenant(user.tenantId);
  }

  @Post()
  create(
    @Body() dto: CreateTenantWhatsappAccountDto,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.whatsappAccounts.createForTenant(user.tenantId, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantWhatsappAccountDto,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.whatsappAccounts.updateForTenant(user.tenantId, id, dto);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  testConnection(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.whatsappAccounts.testConnection(user.tenantId, id);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.whatsappAccounts.removeForTenant(user.tenantId, id);
  }
}
