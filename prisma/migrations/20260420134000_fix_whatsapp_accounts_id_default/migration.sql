-- Fix drift: ensure whatsapp_accounts.id has no DB default
DO $$
BEGIN
  IF to_regclass('public.whatsapp_accounts') IS NOT NULL THEN
    ALTER TABLE "whatsapp_accounts" ALTER COLUMN "id" DROP DEFAULT;
  END IF;
END
$$;

