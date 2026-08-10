"use client";

import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ControlGlyph } from "@/components/domain/control-indicator";
import { BLOCKER_SHORT, STATUS_LABEL } from "@/lib/domain/labels";
import { duration } from "@/lib/utils/time";
import type { Conversation } from "@/lib/domain/types";

/**
 * A live conversation, as a row.
 *
 * Shared by the live rail and the Today briefing so the two never drift. The
 * control glyph is always first and always present — on a surface listing
 * several concurrent calls, "who is driving this one" has to be answerable
 * without reading anything.
 */
export function LiveConversationRow({
  conversation,
  detailed = false,
}: {
  conversation: Conversation;
  /** Adds procedure step and site. For panels with room, not the rail. */
  detailed?: boolean;
}) {
  const isWaiting = conversation.status === "waiting";
  const activeStep = conversation.procedureRun?.steps.find(
    (step) => step.status === "active",
  );

  return (
    <Link
      href={`/conversations/${conversation.id}`}
      className={cn(
        "flex items-start gap-2.5 border-b border-line px-3 py-2.5",
        "transition-colors hover:bg-subtle",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
        isWaiting && "bg-warning-surface/40",
      )}
    >
      <ControlGlyph
        control={conversation.control}
        activity={conversation.activity}
        live={conversation.status === "active"}
        className="mt-0.5"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-ink">
            {conversation.intent ?? STATUS_LABEL[conversation.status]}
          </span>
          <span className="shrink-0 font-mono text-2xs text-faint tabular">
            {duration(conversation.effort.durationSeconds)}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <PhoneCall className="size-3 shrink-0" aria-hidden />
          <span className="truncate font-mono">{conversation.fromLabel}</span>
        </div>

        {detailed && activeStep && (
          <p className="mt-1 truncate text-2xs text-faint">
            {activeStep.label}
          </p>
        )}

        {conversation.blocker && (
          <p className="mt-1 text-2xs font-medium text-warning">
            {BLOCKER_SHORT[conversation.blocker]}
          </p>
        )}
      </div>
    </Link>
  );
}
