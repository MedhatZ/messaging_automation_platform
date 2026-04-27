import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  type RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { verifyMetaXHubSignature256 } from '../meta-hub-signature.util';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class MetaWebhookSignatureGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RawBodyRequest<Request>>();

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new ForbiddenException('Missing raw body for signature verification');
    }

    const signature = req.headers['x-hub-signature-256'];
    const phoneNumberId = this.tryGetPhoneNumberIdFromRawBody(rawBody);

    // Get the secret from the account first (if possible), else from the .env
    const whatsappAccount = phoneNumberId
      ? await this.prisma.whatsappAccount.findUnique({
          where: { metaPhoneNumberId: phoneNumberId },
          select: { metaAppSecret: true },
        })
      : null;

    const secret =
      whatsappAccount?.metaAppSecret?.trim() ||
      this.config.get<string>('whatsapp.metaAppSecret', { infer: true }) ||
      '';

    if (!secret) {
      throw new ForbiddenException('Webhook signature verification is not configured');
    }

    if (!verifyMetaXHubSignature256(rawBody, signature, secret)) {
      throw new ForbiddenException('Invalid webhook signature');
    }

    return true;
  }

  private tryGetPhoneNumberIdFromRawBody(
    rawBody: Buffer,
  ): string | null {
    try {
      const parsed = JSON.parse(rawBody.toString('utf8')) as any;
      const phoneNumberId = parsed?.entry?.[0]?.changes?.[0]?.value?.metadata
        ?.phone_number_id;
      const id = typeof phoneNumberId === 'string' ? phoneNumberId.trim() : '';
      return id || null;
    } catch {
      return null;
    }
  }
}
