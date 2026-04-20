import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import type { JwtAccessPayload } from '../jwt-access-payload.interface';

/**
 * Requires a verified JWT user who is a CLIENT with a tenant on the token.
 * Run after {@link JwtAuthGuard}.
 */
@Injectable()
export class ClientTenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<
      Request & { user?: JwtAccessPayload }
    >();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('User context missing');
    }
    if (user.role !== UserRole.CLIENT) {
      throw new ForbiddenException('Client access only');
    }
    if (
      user.tenantId == null ||
      typeof user.tenantId !== 'string' ||
      user.tenantId.length === 0
    ) {
      throw new BadRequestException('User has no tenant context');
    }
    return true;
  }
}
