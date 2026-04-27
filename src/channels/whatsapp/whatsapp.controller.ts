import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { Response } from 'express';
import { WhatsappWebhookPayloadDto } from '../../whatsapp/dto/webhook-payload.dto';
import { MetaWebhookSignatureGuard } from './guards/meta-webhook-signature.guard';
import { WhatsappWebhookService } from './whatsapp-webhook.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly webhook: WhatsappWebhookService) {}

  @Get('webhook')
  async verify(
    @Res({ passthrough: false }) res: Response,
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
  ): Promise<void> {
    const ok = await this.webhook.verifySubscription(mode, token, challenge);
    if (ok === null) {
      throw new ForbiddenException();
    }
    res.status(HttpStatus.OK).type('text/plain').send(ok);
  }

  @Post('webhook')
  @UseGuards(MetaWebhookSignatureGuard)
  @HttpCode(HttpStatus.OK)
  async receive(@Body() body: unknown): Promise<{ ok: true }> {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Webhook body is required and must be an object');
    }

    const dto = plainToInstance(WhatsappWebhookPayloadDto, body, {
      enableImplicitConversion: false,
    });
    const errors = validateSync(dto, {
      whitelist: false,
      forbidUnknownValues: false,
    });
    if (errors.length > 0) {
      const msg = errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .filter(Boolean)
        .join('; ');
      throw new BadRequestException(
        msg || 'Invalid webhook payload: validation failed',
      );
    }

    if (!Array.isArray(dto.entry) || dto.entry.length === 0) {
      throw new BadRequestException('Invalid webhook payload: entry[] is required');
    }

    // "entry array موجودة وفيها data": require at least one entry with a non-empty changes array.
    const hasChanges = dto.entry.some(
      (e) => Array.isArray(e.changes) && e.changes.length > 0,
    );
    if (!hasChanges) {
      throw new BadRequestException(
        'Invalid webhook payload: entry[].changes[] is required',
      );
    }

    await this.webhook.handleWebhookPayload(body);
    return { ok: true };
  }
}
