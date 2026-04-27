import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../../auth/jwt-access-payload.interface';
import { BaileysService } from './baileys.service';

@Controller('baileys')
@UseGuards(JwtAuthGuard)
export class BaileysController {
  constructor(private readonly baileysService: BaileysService) {}

  @Get('qr')
  getQR(@CurrentUser() user: JwtAccessPayload) {
    const s = this.baileysService.getStatus(user.tenantId);
    return { qr: s.qr, status: s.status };
  }

  @Post('connect')
  async connect(@CurrentUser() user: JwtAccessPayload) {
    await this.baileysService.connectTenant(user.tenantId);
    return this.baileysService.getStatus(user.tenantId);
  }

  @Post('disconnect')
  async disconnect(@CurrentUser() user: JwtAccessPayload) {
    await this.baileysService.disconnectTenant(user.tenantId);
    return this.baileysService.getStatus(user.tenantId);
  }
}

