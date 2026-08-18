"use client";

import Link from "next/link";
import {
  CircleAlert,
  Info,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Badge, StatusPill } from "@/components/primitives/status";
import {
  CAUSE_LABEL,
  FIX_KIND_LABEL,
  SEVERITY_LABEL,
  SEVERITY_TONE,
} from "@/lib/domain/labels";
import { count } from "@/lib/lexicon";
import { useLexicon } from "@/components/providers/app-providers";
import { relative } from "@/lib/utils/time";
import type { IssueSeverity, ReviewIssue } from "@/lib/domain/types";

/**
 * A review issue, as a row.
 *
 * The row has to answer three questions before it is read properly: how bad,
 * what kind of failure, and how much of the business it touched. Severity gets
 * its own glyph per level rather than one triangle in four colours — the
 * distinction has to survive greyscale and a glance, so the shape carries it
 * alongside the colour and the word.
 */

const SEVERITY_ICON: Record<IssueSeverity, LucideIcon> = {
  critical: OctagonAlert,
  high: TriangleAlert,
  medium: CircleAlert,
  low: Info,
};

const SEVERITY_ICON_COLOUR: Record<IssueSeverity, string> = {
  critical: "text-danger",
  high: "text-warning",
  medium: "text-info",
  low: "text-faint",
};

export function SeverityMark({
  severity,
  className,
}: {
  severity: IssueSeverity;
  className?: string;
}) {
  const Icon = SEVERITY_ICON[severity];
  return (
    <Icon
      className={cn("size-4 shrink-0", SEVERITY_ICON_COLOUR[severity], className)}
      aria-hidden
    />
  );
}

/** Severity and cause, together, in the order they are read. */
export function IssueTags({ issue }: { issue: ReviewIssue }) {
  return (
    <>
      <StatusPill tone={SEVERITY_TONE[issue.severity]}>
        {SEVERITY_LABEL[issue.severity]}
      </StatusPill>
      <Badge>{CAUSE_LABEL[issue.cause]}</Badge>
    </>
  );
}

export function ReviewIssueRow({ issue }: { issue: ReviewIssue }) {
  const lexicon = useLexicon();

  return (
    <Link
      href={`/review/${issue.id}`}
      className={cn(
        "block border-b border-line px-4 py-4 last:border-b-0",
        "transition-colors hover:bg-subtle",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
      )}
    >
      <div className="flex items-start gap-3">
        <SeverityMark severity={issue.severity} className="mt-0.5" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <IssueTags issue={issue} />
            {issue.assignedToUserId && <Badge>Assigned</Badge>}
          </div>

          <p className="mt-2 text-md font-medium text-ink">{issue.title}</p>
          <p className="mt-1 line-clamp-2 text-sm text-muted">{issue.detail}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
            {/* Blast radius, not instance count. The number is the argument for
                doing this one first, so it is the first thing in the line. */}
            <span className="text-muted">
              {count(issue.affectedConversationCount, lexicon.conversation)}{" "}
              affected
            </span>
            <span aria-hidden>·</span>
            <span>last seen {relative(issue.lastSeenAt)} ago</span>
            <span aria-hidden>·</span>
            <span>
              {issue.proposedFix
                ? `Proposed fix: ${FIX_KIND_LABEL[issue.proposedFix.kind]}`
                : "No fix proposed yet"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
