-- Product: replace single image_url with image_urls array

ALTER TABLE "products" ADD COLUMN "image_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "products"
SET "image_urls" = CASE
  WHEN "image_url" IS NOT NULL AND TRIM(BOTH FROM "image_url") <> '' THEN ARRAY[TRIM(BOTH FROM "image_url")]::TEXT[]
  ELSE ARRAY[]::TEXT[]
END;

ALTER TABLE "products" DROP COLUMN "image_url";
