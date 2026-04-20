-- Composite index for listing / fallback queries by tenant + sendable status
CREATE INDEX "whatsapp_accounts_tenant_id_status_idx" ON "whatsapp_accounts" ("tenant_id", "status");
