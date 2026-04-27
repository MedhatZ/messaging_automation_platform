import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BroadcastService, type BroadcastFilter } from './broadcast.service';

class BroadcastDto {
  tenantId: string;
  message: string;
  filter: BroadcastFilter;
  delayBetweenMs?: number;
}

@Controller('broadcast')
@UseGuards(JwtAuthGuard)
export class BroadcastController {
  constructor(private readonly broadcastService: BroadcastService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async send(@Body() dto: BroadcastDto) {
    const result = await this.broadcastService.send({
      tenantId: dto.tenantId,
      message: dto.message,
      filter: dto.filter ?? 'all',
      delayBetweenMs: dto.delayBetweenMs,
    });
    return { success: true, ...result };
  }
}

