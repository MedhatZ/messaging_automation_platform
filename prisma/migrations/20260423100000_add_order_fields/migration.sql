-- Add order flow fields to leads
ALTER TABLE "leads" ADD COLUMN "order_step" TEXT;
ALTER TABLE "leads" ADD COLUMN "order_phone" TEXT;

