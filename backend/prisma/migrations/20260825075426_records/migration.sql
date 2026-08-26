-- CreateTable
CREATE TABLE "records" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "archetype" TEXT NOT NULL DEFAULT 'visit',
    "type_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "party_name" TEXT,
    "party_phone" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "fields_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "records_workspace_id_created_at_idx" ON "records"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "records_conversation_id_idx" ON "records"("conversation_id");

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

