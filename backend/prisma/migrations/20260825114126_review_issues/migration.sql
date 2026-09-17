-- CreateTable
CREATE TABLE "review_issues" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "ai_employee_id" TEXT,
    "cause_key" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_to_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_issue_events" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "detail" TEXT,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_issue_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_issues_workspace_id_status_idx" ON "review_issues"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "review_issues_workspace_id_cause_key_key" ON "review_issues"("workspace_id", "cause_key");

-- CreateIndex
CREATE INDEX "review_issue_events_issue_id_detected_at_idx" ON "review_issue_events"("issue_id", "detected_at");

-- CreateIndex
CREATE INDEX "review_issue_events_conversation_id_idx" ON "review_issue_events"("conversation_id");

-- AddForeignKey
ALTER TABLE "review_issues" ADD CONSTRAINT "review_issues_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_issues" ADD CONSTRAINT "review_issues_ai_employee_id_fkey" FOREIGN KEY ("ai_employee_id") REFERENCES "ai_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_issue_events" ADD CONSTRAINT "review_issue_events_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "review_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_issue_events" ADD CONSTRAINT "review_issue_events_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
