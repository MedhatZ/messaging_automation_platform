import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI reads the datasource URL from this file (Prisma ORM v7+).
 * `prisma generate` does not open a DB connection; a placeholder is only used when
 * `DATABASE_URL` is unset (e.g. fresh CI checkout before `.env` exists).
 */
const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=public';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'ts-node --compiler-options {"module":"CommonJS"} prisma/seed.ts',
  },
  datasource: {
    url: databaseUrl,
  },
});
