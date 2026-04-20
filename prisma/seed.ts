import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=public';

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const ADMIN_EMAIL = 'admin@test.com';
const ADMIN_PASSWORD = '123456';

/** Stable id so re-seed can reuse the same platform tenant. */
const PLATFORM_TENANT_ID = '00000000-0000-4000-8000-000000000001';

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: PLATFORM_TENANT_ID },
    create: {
      id: PLATFORM_TENANT_ID,
      name: 'Platform',
      email: 'platform@internal.local',
      isActive: true,
    },
    update: {},
  });

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      email: ADMIN_EMAIL,
      password: passwordHash,
      role: UserRole.ADMIN,
      tenantId: tenant.id,
    },
    update: {
      password: passwordHash,
      role: UserRole.ADMIN,
      tenantId: tenant.id,
    },
  });

  console.log(`Seeded admin: ${ADMIN_EMAIL} (tenant ${tenant.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
