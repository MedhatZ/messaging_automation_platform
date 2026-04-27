-- Add lead status to conversations
ALTER TABLE "conversations" ADD COLUMN "lead_status" TEXT NOT NULL DEFAULT 'new';

