-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "sales_step" TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE "conversations" ADD COLUMN "temp_data" JSONB;
