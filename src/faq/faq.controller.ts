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
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { FaqService } from './faq.service';

@Controller('faq')
@UseGuards(JwtAuthGuard, ClientTenantGuard)
export class FaqController {
  constructor(private readonly faqService: FaqService) {}

  @Post()
  create(@Body() dto: CreateFaqDto, @CurrentUser() user: JwtAccessPayload) {
    return this.faqService.create(dto, user.tenantId);
  }

  @Get()
  findAll(@CurrentUser() user: JwtAccessPayload) {
    return this.faqService.findAllByTenant(user.tenantId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.faqService.findOne(id, user.tenantId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFaqDto,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.faqService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.faqService.remove(id, user.tenantId);
  }
}
