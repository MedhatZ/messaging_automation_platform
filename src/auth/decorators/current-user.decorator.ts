import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtAccessPayload } from '../jwt-access-payload.interface';

/**
 * Returns `request.user` (decoded JWT payload) set by {@link JwtAuthGuard}.
 * Optionally pass a property key, e.g. `@CurrentUser('tenantId')`.
 */
export const CurrentUser = createParamDecorator(
  (
    data: keyof JwtAccessPayload | undefined,
    ctx: ExecutionContext,
  ): JwtAccessPayload | JwtAccessPayload[keyof JwtAccessPayload] | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtAccessPayload }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
