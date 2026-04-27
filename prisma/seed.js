"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const pg_1 = require("pg");
const connectionString = process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=public';
const pool = new pg_1.Pool({ connectionString });
const prisma = new client_1.PrismaClient({ adapter: new adapter_pg_1.PrismaPg(pool) });
const ADMIN_EMAIL = 'admin@test.com';
const ADMIN_PASSWORD = '123456';
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
            role: client_1.UserRole.ADMIN,
            tenantId: tenant.id,
        },
        update: {
            password: passwordHash,
            role: client_1.UserRole.ADMIN,
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
//# sourceMappingURL=seed.js.map