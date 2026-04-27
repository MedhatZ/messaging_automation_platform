/**
 * BullMQ sanity test (Redis required).
 *
 * What it does:
 * - Creates a temporary queue and worker (in this script)
 * - Enqueues a job that fails once, then succeeds
 * - Verifies retry/backoff behavior by observing attemptsMade
 *
 * Required env:
 * - REDIS_URL (default redis://localhost:6379)
 */

const { Queue, Worker } = require('bullmq');

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const redisUrl = (process.env.REDIS_URL || 'redis://localhost:6379').trim();
  const queueName = `test-queue-${Date.now()}`;

  const queue = new Queue(queueName, { connection: { url: redisUrl } });

  let seenAttempts = [];
  const worker = new Worker(
    queueName,
    async (job) => {
      seenAttempts.push(job.attemptsMade);
      if (job.attemptsMade === 0) {
        throw new Error('fail-once');
      }
      return { ok: true };
    },
    {
      connection: { url: redisUrl },
      concurrency: 1,
    },
  );

  const job = await queue.add(
    'retry_test',
    { hello: 'world' },
    {
      attempts: 2,
      backoff: { type: 'fixed', delay: 500 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  );

  const started = Date.now();
  let completed = false;
  while (Date.now() - started < 15000) {
    const j = await queue.getJob(job.id);
    if (!j) {
      // removed on complete
      completed = true;
      break;
    }
    const state = await j.getState();
    if (state === 'completed') {
      completed = true;
      break;
    }
    if (state === 'failed') {
      throw new Error('job failed unexpectedly');
    }
    await sleep(250);
  }

  await worker.close();
  await queue.close();

  if (!completed) {
    throw new Error('timeout waiting for completion');
  }

  if (!seenAttempts.includes(0) || !seenAttempts.includes(1)) {
    throw new Error(`expected attempts [0,1], got ${JSON.stringify(seenAttempts)}`);
  }

  console.log(
    JSON.stringify({ ok: true, queueName, seenAttempts }, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

