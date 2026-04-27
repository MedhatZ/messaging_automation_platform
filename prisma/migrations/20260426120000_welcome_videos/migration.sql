-- AlterTable
ALTER TABLE "bot_settings" ADD COLUMN IF NOT EXISTS "welcome_videos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
