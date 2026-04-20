import type { UserRole } from '@prisma/client';

/** Claims embedded in JWT access tokens (see `AuthService.login`). */
export interface JwtAccessPayload {
  userId: string;
  role: UserRole;
  tenantId: string;
}
