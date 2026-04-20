import { Module } from '@nestjs/common';

/**
 * Replaces {@link PrismaModule} in e2e so a live PostgreSQL instance is not required.
 */
@Module({})
export class NoopPrismaModule {}
