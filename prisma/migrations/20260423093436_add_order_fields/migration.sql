/*
  Warnings:

  - A unique constraint covering the columns `[tenant_id,phone]` on the table `leads` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "LeadStatus" ADD VALUE 'ORDER_PENDING';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "last_message" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "size" TEXT;

-- CreateIndex
CREATE INDEX "leads_tenant_id_phone_idx" ON "leads"("tenant_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "leads_tenant_id_phone_key" ON "leads"("tenant_id", "phone");
