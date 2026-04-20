-- Multi-tenant WhatsApp Cloud API credentials per phone number

CREATE TABLE "whatsapp_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "meta_phone_number_id" TEXT NOT NULL,
    "meta_waba_id" TEXT,
    "display_phone_number" TEXT,
    "access_token_encrypted" TEXT NOT NULL,
    "verify_token" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_accounts_meta_phone_number_id_key" ON "whatsapp_accounts"("meta_phone_number_id");

CREATE INDEX "whatsapp_accounts_tenant_id_idx" ON "whatsapp_accounts"("tenant_id");

CREATE INDEX "whatsapp_accounts_meta_waba_id_idx" ON "whatsapp_accounts"("meta_waba_id");

ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
