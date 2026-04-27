import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BaileysService } from './baileys.service';

@Controller('baileys')
@UseGuards(JwtAuthGuard)
export class BaileysController {
  constructor(private readonly baileysService: BaileysService) {}

  @Get('qr')
  getQR() {
    const qr = this.baileysService.getQR();
    return { qr: qr ?? null, connected: !qr };
  }
}

