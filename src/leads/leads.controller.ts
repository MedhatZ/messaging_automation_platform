import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtAccessPayload } from '../auth/jwt-access-payload.interface';
import { ClientTenantGuard } from '../auth/guards/client-tenant.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadsService } from './leads.service';

@Controller('leads')
@UseGuards(JwtAuthGuard, ClientTenantGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  findAll(@CurrentUser() user: JwtAccessPayload) {
    return this.leadsService.findAllByTenant(user.tenantId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.leadsService.updateStatus(id, user.tenantId, dto.status);
  }
}
