-- CreateTable
CREATE TABLE "product_views" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "view_duration" INTEGER NOT NULL,
    "mentioned_in_chat" BOOLEAN NOT NULL DEFAULT true,
    "order_placed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_recommendations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "recommended_products" JSONB NOT NULL,
    "clicked_product_id" UUID,
    "clicked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_affinities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "associated_keywords" TEXT[] NOT NULL,
    "total_mentions" INTEGER NOT NULL DEFAULT 0,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "conversion_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_affinities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_views_conversation_id_product_id_key" ON "product_views"("conversation_id", "product_id");

-- CreateIndex
CREATE INDEX "product_views_tenant_id_idx" ON "product_views"("tenant_id");

-- CreateIndex
CREATE INDEX "product_views_product_id_idx" ON "product_views"("product_id");

-- CreateIndex
CREATE INDEX "product_views_created_at_idx" ON "product_views"("created_at");

-- CreateIndex
CREATE INDEX "product_recommendations_tenant_id_idx" ON "product_recommendations"("tenant_id");

-- CreateIndex
CREATE INDEX "product_recommendations_conversation_id_idx" ON "product_recommendations"("conversation_id");

-- CreateIndex
CREATE INDEX "product_recommendations_created_at_idx" ON "product_recommendations"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_affinities_tenant_id_product_id_key" ON "product_affinities"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "product_affinities_tenant_id_idx" ON "product_affinities"("tenant_id");

-- CreateIndex
CREATE INDEX "product_affinities_conversion_rate_idx" ON "product_affinities"("conversion_rate");

-- AddForeignKey
ALTER TABLE "product_views" ADD CONSTRAINT "product_views_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_views" ADD CONSTRAINT "product_views_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_views" ADD CONSTRAINT "product_views_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_recommendations" ADD CONSTRAINT "product_recommendations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_recommendations" ADD CONSTRAINT "product_recommendations_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_affinities" ADD CONSTRAINT "product_affinities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_affinities" ADD CONSTRAINT "product_affinities_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

