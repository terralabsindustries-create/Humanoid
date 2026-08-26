-- Budget and the behaviour at the cap live on the workspace: one per tenant,
-- read on every inbound call, and meaningless without one.
ALTER TABLE "workspaces" ADD COLUMN "budget_month_minor" INTEGER;
ALTER TABLE "workspaces" ADD COLUMN "at_cap" TEXT NOT NULL DEFAULT 'notify';

-- What one call consumed. Units are measured; money is those units priced at
-- rates the operator configured, snapshotted per row so a later rate change
-- cannot rewrite history.
CREATE TABLE "call_usage" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "connected_seconds" INTEGER NOT NULL,
    "model_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "model_output_tokens" INTEGER NOT NULL DEFAULT 0,
    "tokens_metered" BOOLEAN NOT NULL DEFAULT false,
    "telephony_cost_minor" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "model_cost_minor" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "rates_json" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_usage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "call_usage_conversation_id_key" ON "call_usage"("conversation_id");
CREATE INDEX "call_usage_workspace_id_occurred_at_idx" ON "call_usage"("workspace_id", "occurred_at");

ALTER TABLE "call_usage" ADD CONSTRAINT "call_usage_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "call_usage" ADD CONSTRAINT "call_usage_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
