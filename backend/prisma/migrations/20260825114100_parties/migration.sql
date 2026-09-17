-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "party_id" TEXT;

-- AlterTable
ALTER TABLE "records" ADD COLUMN     "party_id" TEXT;

-- CreateTable
CREATE TABLE "parties" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "primary_phone" TEXT,
    "primary_email" TEXT,
    "preferred_language" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_contact_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_facts" (
    "id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ai_inferred',
    "settled_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "party_facts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parties_workspace_id_last_contact_at_idx" ON "parties"("workspace_id", "last_contact_at");

-- CreateIndex
CREATE UNIQUE INDEX "parties_workspace_id_primary_phone_key" ON "parties"("workspace_id", "primary_phone");

-- CreateIndex
CREATE UNIQUE INDEX "party_facts_party_id_label_key" ON "party_facts"("party_id", "label");

-- CreateIndex
CREATE INDEX "conversations_party_id_idx" ON "conversations"("party_id");

-- CreateIndex
CREATE INDEX "records_party_id_idx" ON "records"("party_id");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_facts" ADD CONSTRAINT "party_facts_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
