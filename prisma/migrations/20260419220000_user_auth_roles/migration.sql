-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CLIENT');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email" TEXT;
ALTER TABLE "users" ADD COLUMN     "password" TEXT;
ALTER TABLE "users" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'CLIENT';

UPDATE "users" SET
  "email" = CONCAT('user-', "id"::text, '@migrated.invalid'),
  "password" = '__REQUIRES_PASSWORD_RESET__'
WHERE "email" IS NULL;

ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "password" SET NOT NULL;

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
