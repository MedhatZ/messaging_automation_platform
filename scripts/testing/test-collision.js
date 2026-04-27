/**
 * Collision lock test (Redis required).
 *
 * What it does:
 * - Two simulated agents try to lock the same conversation
 * - Exactly one should succeed (NX lock)
 * - Then release and ensure the other can lock
 *
 * Required env:
 * - REDIS_URL (default redis://localhost:6379)
 */

const Redis = require('ioredis');

async function main() {
  const redisUrl = (process.env.REDIS_URL || 'redis://localhost:6379').trim();
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
  });

  const conversationId = process.env.CONVERSATION_ID || `conv-${Date.now()}`;
  const key = `lock:conversation:${conversationId}`;
  const ttl = 10;

  const agentA = 'tenantA:agentA';
  const agentB = 'tenantA:agentB';

  await redis.connect();
  await redis.del(key);

  const a = await redis.set(key, agentA, 'EX', ttl, 'NX');
  const b = await redis.set(key, agentB, 'EX', ttl, 'NX');

  const current = await redis.get(key);

  if (!((a === 'OK' && b === null) || (a === null && b === 'OK'))) {
    throw new Error(`expected exactly one lock OK, got a=${a} b=${b}`);
  }

  if (current !== agentA && current !== agentB) {
    throw new Error(`unexpected lock value: ${current}`);
  }

  // Release only if owner
  const lua =
    'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
  const releasedWrong = await redis.eval(lua, 1, key, current === agentA ? agentB : agentA);
  const releasedRight = await redis.eval(lua, 1, key, current);

  if (Number(releasedWrong) !== 0) throw new Error('wrong agent released the lock');
  if (Number(releasedRight) !== 1) throw new Error('owner did not release the lock');

  const after = await redis.get(key);
  if (after != null) throw new Error('lock was not cleared');

  // Now the other agent should be able to lock
  const ok2 = await redis.set(key, agentA, 'EX', ttl, 'NX');
  if (ok2 !== 'OK') throw new Error('expected lock after release');

  await redis.del(key);
  await redis.quit();

  console.log(JSON.stringify({ ok: true, conversationId }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

