import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache/cache.service';

export type TenantRateLimitKind = 'webhook' | 'outbound';

/**
 * Fixed-window per-tenant counters (Redis via {@link CacheService} when available,
 * otherwise in-process fallback for dev / degraded mode).
 */
@Injectable()
export class TenantRateLimitService {
  private readonly logger = new Logger(TenantRateLimitService.name);
  private readonly windowSec = 60;

  constructor(
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {}

  /**
   * @returns true if the request is under the limit (and consumes one slot).
   */
  async tryConsume(
    tenantId: string,
    kind: TenantRateLimitKind,
  ): Promise<boolean> {
    const max =
      kind === 'webhook'
        ? this.config.get<number>('rateLimit.webhookPerMinute', {
            infer: true,
          }) ?? 60
        : this.config.get<number>('rateLimit.outboundPerMinute', {
            infer: true,
          }) ?? 300;

    const slot = Math.floor(Date.now() / 1000 / this.windowSec);
    const key = `rl:tenant:${kind}:${tenantId}:${slot}`;
    const ttl = this.windowSec + 5;

    const n = await this.cache.incrWithTtl(key, ttl);
    if (n > max) {
      this.logger.warn(
        JSON.stringify({
          category: 'rate_limit',
          kind,
          tenantId,
          count: n,
          max,
        }),
      );
      return false;
    }
    return true;
  }
}
