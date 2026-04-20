-- Locked chat language per conversation (set from first user message).

ALTER TABLE "conversations" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'ar';
