require('dotenv/config');

const { Client } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

async function main() {
  const migrationName = process.argv[2];
  if (!migrationName) {
    throw new Error('Usage: node scripts/update-prisma-migration-checksum.js <migration_name>');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required (set env or provide .env.local/.env)');
  }

  const migrationPath = path.join(
    process.cwd(),
    'prisma',
    'migrations',
    migrationName,
    'migration.sql',
  );
  const sql = fs.readFileSync(migrationPath);
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const res = await client.query(
    'UPDATE \"_prisma_migrations\" SET checksum = $1 WHERE migration_name = $2',
    [checksum, migrationName],
  );

  await client.end();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ migrationName, checksum, updatedRows: res.rowCount }));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

