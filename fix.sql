ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "slug" TEXT UNIQUE;
ALTER TABLE "bot_settings" ADD COLUMN IF NOT EXISTS "welcome_message" TEXT;
ALTER TABLE "bot_settings" ADD COLUMN IF NOT EXISTS "welcome_images" TEXT[] DEFAULT '{}';

CREATE TABLE IF NOT EXISTS "orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenant_id" UUID NOT NULL,
  "customer_name" TEXT NOT NULL,
  "customer_phone" TEXT NOT NULL,
  "customer_address" TEXT NOT NULL,
  "location_url" TEXT,
  "notes" TEXT,
  "items" JSONB NOT NULL DEFAULT '[]',
  "total" FLOAT NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "source_phone" TEXT,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "orders_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "orders_tenant_id_idx" ON "orders"("tenant_id");
CREATE INDEX IF NOT EXISTS "orders_tenant_id_status_idx" ON "orders"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "orders_created_at_idx" ON "orders"("created_at");
