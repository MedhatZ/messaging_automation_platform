-- Add follow-up timestamp to conversations
ALTER TABLE "conversations" ADD COLUMN "last_follow_up_at" TIMESTAMP(3);

