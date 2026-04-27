-- CreateTable
CREATE TABLE "conversation_memories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "message_text" TEXT NOT NULL,
    "embedding" JSONB,
    "role" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_memories_tenant_id_idx" ON "conversation_memories"("tenant_id");

-- CreateIndex
CREATE INDEX "conversation_memories_conversation_id_idx" ON "conversation_memories"("conversation_id");

-- CreateIndex
CREATE INDEX "conversation_memories_timestamp_idx" ON "conversation_memories"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_memories_conversation_id_timestamp_key" ON "conversation_memories"("conversation_id", "timestamp");

-- AddForeignKey
ALTER TABLE "conversation_memories" ADD CONSTRAINT "conversation_memories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_memories" ADD CONSTRAINT "conversation_memories_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

