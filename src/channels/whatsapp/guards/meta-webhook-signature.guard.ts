import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { verifyMetaXHubSignature256 } from '../meta-hub-signature.util';

@Injectable()
export class MetaWebhookSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest<Request>>();

    const secret = (process.env.META_APP_SECRET ?? '').trim();
    if (!secret) {
      throw new ForbiddenException('Webhook signature verification is not configured');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new ForbiddenException('Missing raw body for signature verification');
    }

    const signature = req.headers['x-hub-signature-256'];
    if (
      !verifyMetaXHubSignature256(
        rawBody,
        signature,
        secret,
      )
    ) {
      throw new ForbiddenException('Invalid webhook signature');
    }

    return true;
  }
}
