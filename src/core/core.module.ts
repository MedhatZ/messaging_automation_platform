import { Global, Module } from '@nestjs/common';

/**
 * Cross-cutting infrastructure (e.g. logging, scheduling) can be registered here later.
 */
@Global()
@Module({})
export class CoreModule {}
