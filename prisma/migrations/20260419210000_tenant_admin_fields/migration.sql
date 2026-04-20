-- Tenant admin / client metadata

ALTER TABLE "tenants" ADD COLUMN     "name" TEXT;
ALTER TABLE "tenants" ADD COLUMN     "email" TEXT;
ALTER TABLE "tenants" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "tenants" ADD COLUMN     "subscription_end" TIMESTAMP(3);
