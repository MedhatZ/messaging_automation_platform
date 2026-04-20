import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Restrict route to one or more `UserRole` values (use with `RolesGuard`). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
