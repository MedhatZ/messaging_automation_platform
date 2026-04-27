import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../../cache/cache.service';

@Injectable()
export class CollisionGuardService {
  private readonly logger = new Logger(CollisionGuardService.name);
  private readonly ttlSeconds = 30;

  constructor(private readonly cache: CacheService) {}

  private lockKey(conversationId: string): string {
    return `lock:conversation:${conversationId}`;
  }

  async tryLockConversation(
    conversationId: string,
    agentId: string,
    tenantId: string,
    lockTTL: number = this.ttlSeconds,
  ): Promise<boolean> {
    void tenantId;
    if (process.env.QUEUES_DISABLED === 'true') return true; // degraded mode => no locking
    if (!this.cache.isEnabled()) return true;

    const key = this.lockKey(conversationId);
    try {
      const ok = await this.cache.setNx(key, agentId, lockTTL);
      return ok;
    } catch (e) {
      this.logger.warn(`tryLockConversation failed: ${e instanceof Error ? e.message : String(e)}`);
      return true;
    }
  }

  async releaseLock(conversationId: string, agentId: string): Promise<boolean> {
    if (process.env.QUEUES_DISABLED === 'true') return true;
    if (!this.cache.isEnabled()) return true;

    const key = this.lockKey(conversationId);
    try {
      const current = await this.cache.get(key);
      if (current !== agentId) return false;
      await this.cache.del(key);
      return true;
    } catch (e) {
      this.logger.warn(`releaseLock failed: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  async getCurrentAgent(conversationId: string): Promise<string | null> {
    try {
      const v = await this.cache.get(this.lockKey(conversationId));
      return typeof v === 'string' && v.trim() ? v : null;
    } catch {
      return null;
    }
  }

  async isConversationLocked(conversationId: string): Promise<boolean> {
    const v = await this.getCurrentAgent(conversationId);
    return Boolean(v);
  }

  async extendLock(
    conversationId: string,
    agentId: string,
    seconds: number,
  ): Promise<boolean> {
    if (process.env.QUEUES_DISABLED === 'true') return true;
    if (!this.cache.isEnabled()) return true;

    const ttl = Math.max(1, Math.floor(seconds));
    const key = this.lockKey(conversationId);
    try {
      const current = await this.cache.get(key);
      if (current !== agentId) return false;
      return await this.cache.expire(key, ttl);
    } catch (e) {
      this.logger.warn(`extendLock failed: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }
}

