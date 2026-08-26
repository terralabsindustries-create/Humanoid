-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "phone_number" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_phone_number_key" ON "workspaces"("phone_number");

