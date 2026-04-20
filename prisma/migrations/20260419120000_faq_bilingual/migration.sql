-- Bilingual FAQ: migrate existing Arabic content into *_ar columns.

ALTER TABLE "faqs" ADD COLUMN     "question_ar" TEXT;
ALTER TABLE "faqs" ADD COLUMN     "question_en" TEXT;
ALTER TABLE "faqs" ADD COLUMN     "answer_ar" TEXT;
ALTER TABLE "faqs" ADD COLUMN     "answer_en" TEXT;
ALTER TABLE "faqs" ADD COLUMN     "keywords_ar" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "faqs" ADD COLUMN     "keywords_en" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "faqs" SET
  "question_ar" = COALESCE("question", ''),
  "question_en" = '',
  "answer_ar" = COALESCE("answer", ''),
  "answer_en" = '',
  "keywords_ar" = COALESCE("keywords", ARRAY[]::TEXT[]),
  "keywords_en" = ARRAY[]::TEXT[];

ALTER TABLE "faqs" ALTER COLUMN "question_ar" SET NOT NULL;
ALTER TABLE "faqs" ALTER COLUMN "question_en" SET NOT NULL;
ALTER TABLE "faqs" ALTER COLUMN "answer_ar" SET NOT NULL;
ALTER TABLE "faqs" ALTER COLUMN "answer_en" SET NOT NULL;
ALTER TABLE "faqs" ALTER COLUMN "keywords_ar" SET NOT NULL;
ALTER TABLE "faqs" ALTER COLUMN "keywords_en" SET NOT NULL;

ALTER TABLE "faqs" DROP COLUMN "question";
ALTER TABLE "faqs" DROP COLUMN "answer";
ALTER TABLE "faqs" DROP COLUMN "keywords";
