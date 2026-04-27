import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client: Redis | null = null;
  /** In-process rate-limit buckets when Redis is unavailable or errors. */
  private readonly memIncr = new Map<string, { n: number; exp: number }>();

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return Boolean(this.client);
  }

  onModuleInit(): void {
    const url = this.config.get<string>('redis.url')?.trim();
    if (!url) {
      this.logger.warn(
        'REDIS_URL is not set; cache is disabled and callers should use primary storage.',
      );
      return;
    }

    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });

    this.client.on('error', (err: Error) => {
      this.logger.warn(`Redis client error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.quit();
    } catch (err) {
      this.logger.warn(
        `Redis quit failed: ${err instanceof Error ? err.message : err}`,
      );
      this.client.disconnect(false);
    } finally {
      this.client = null;
    }
  }

  /**
   * Returns cached string value, or null on miss / disabled cache / errors.
   */
  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      const v = await this.client.get(key);
      return v;
    } catch (err) {
      this.logger.warn(
        `Cache get failed for key=${key}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  /**
   * Stores value with TTL in seconds. Swallows errors so callers can continue without cache.
   */
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(
        `Cache set failed for key=${key}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Best-effort cache invalidation. Ignores errors when Redis is down.
   */
  async del(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(key);
    } catch (err) {
      this.logger.warn(
        `Cache del failed for key=${key}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Best-effort pattern delete using SCAN + DEL. Returns number of deleted keys.
   * Safe for production: avoids KEYS.
   */
  async deleteByPattern(pattern: string): Promise<number> {
    const redis = this.client;
    if (!redis) return 0;

    let cursor = '0';
    let deleted = 0;

    try {
      do {
        const res = (await redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          '200',
        )) as unknown as [string, string[]];
        cursor = res?.[0] ?? '0';
        const keys = Array.isArray(res?.[1]) ? res[1] : [];
        if (keys.length > 0) {
          // ioredis `del` accepts (...keys)
          const n = await (redis as any).del(...keys);
          deleted += Number(n) || 0;
        }
      } while (cursor !== '0');
    } catch (err) {
      this.logger.warn(
        `Cache deleteByPattern failed for pattern=${pattern}: ${err instanceof Error ? err.message : err}`,
      );
      return deleted;
    }

    return deleted;
  }

  /**
   * SET key value NX EX ttl. Returns true if lock acquired.
   * Best-effort: returns false when Redis is unavailable/errors.
   */
  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (!this.client) return false;
    try {
      const ok = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
      return ok === 'OK';
    } catch (err) {
      this.logger.warn(
        `Cache setNx failed for key=${key}: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }

  /**
   * EXPIRE key ttlSeconds. Returns true if TTL updated.
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.client) return false;
    try {
      const res = await this.client.expire(key, ttlSeconds);
      return Number(res) > 0;
    } catch (err) {
      this.logger.warn(
        `Cache expire failed for key=${key}: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }

  /**
   * INCR with TTL on first set (for fixed-window rate limits). Falls back to memory if Redis fails.
   */
  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    if (this.client) {
      try {
        const n = await this.client.incr(key);
        if (n === 1) {
          await this.client.expire(key, ttlSeconds);
        }
        return n;
      } catch (err) {
        this.logger.warn(
          `Redis INCR failed for key=${key}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return this.memIncrWithTtl(key, ttlSeconds);
  }

  private memIncrWithTtl(key: string, ttlSeconds: number): number {
    const now = Date.now();
    const ttlMs = ttlSeconds * 1000;
    const row = this.memIncr.get(key);
    if (!row || row.exp <= now) {
      this.memIncr.set(key, { n: 1, exp: now + ttlMs });
      return 1;
    }
    row.n += 1;
    return row.n;
  }
}
