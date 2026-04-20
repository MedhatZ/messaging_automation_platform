import {
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
import type { Response } from 'express';
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
    await this.webhook.handleWebhookPayload(body);
    return { ok: true };
  }
}
