import { Global, Module } from '@nestjs/common';

/**
 * Shared utilities, guards, interceptors, and DTOs can live under `common/` and be wired here.
 */
@Global()
@Module({})
export class CommonModule {}
