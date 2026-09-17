"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import { useScope } from "@/lib/store/scope";
import { useLexicon } from "@/components/providers/app-providers";
import { EmptyState, ErrorState } from "@/components/primitives/empty-state";
import {
  LoadingAnnouncement,
  Skeleton,
} from "@/components/primitives/skeleton";
import { ReviewIssueRow } from "@/components/domain/review-issue-row";
import { CAUSE_LABEL, ISSUE_STATUS_LABEL } from "@/lib/domain/labels";
import {
  causeFacets,
  rankIssues,
  totalAffected,
  type CauseFacet,
} from "@/lib/domain/review";
import { count, lower } from "@/lib/lexicon";
import type {
  IssueCause,
  IssueStatus,
  ReviewIssue,
} from "@/lib/domain/types";
import { useQuery } from "@tanstack/react-query";

/**
 * Review — the single work queue.
 *
 * The organising decision, and the reason this is one queue rather than two:
 * a row here is a *cause*, not an incident. "No approved answer for do you take
 * NHS patients" is one row affecting forty-three calls, not forty-three rows.
 * Everything else on the screen follows from that — the ranking is by how much
 * of the business a cause is touching, and the facets in the rail cut by kind
 * of failure rather than by date.
 *
 * The only writing this queue does is triage — moving a cause between the four
 * tabs — and that happens on the issue itself. The repair does not: the change
 * is made in Build, against a draft that has to simulate green, and the issue
 * detail says so rather than offering a button that would have to lie.
 */

const STATUS_ORDER: IssueStatus[] = [
  "open",
  "in_progress",
  "resolved",
  "dismissed",
];

export function ReviewQueue() {
  const scope = useScope();
  const [status, setStatus] = useState<IssueStatus>("open");
  const [cause, setCause] = useState<IssueCause | null>(null);

  const issuesQuery = useQuery({
    queryKey: qk.issues(scope),
    queryFn: () => service.listReviewIssues(scope),
  });

  const issues = useMemo(() => issuesQuery.data ?? [], [issuesQuery.data]);

  const byStatus = useMemo(
    () => issues.filter((issue) => issue.status === status),
    [issues, status],
  );

  const facets = useMemo(() => causeFacets(byStatus), [byStatus]);

  const visible = useMemo(
    () => rankIssues(cause ? byStatus.filter((i) => i.cause === cause) : byStatus),
    [byStatus, cause],
  );

  // A cause filter that survives a status change would silently show an empty
  // list under a tab that has items in it.
  const selectStatus = (next: IssueStatus) => {
    setStatus(next);
    setCause(null);
  };

  if (issuesQuery.isError) {
    return (
      <Page rail={null}>
        <Header />
        <ErrorState
          title="Could not load the review queue"
          detail="The review service did not respond. Calls are unaffected and are still being answered — this failure is limited to this list."
          onRetry={() => issuesQuery.refetch()}
        />
      </Page>
    );
  }

  return (
    <Page
      rail={
        issuesQuery.isPending ? null : (
          <Rail
            issues={byStatus}
            facets={facets}
            selected={cause}
            onSelect={setCause}
          />
        )
      }
    >
      <Header issues={issues} loading={issuesQuery.isPending} />

      <div className="mt-7 flex flex-wrap items-center gap-1">
        {STATUS_ORDER.map((candidate) => (
          <StatusTab
            key={candidate}
            label={ISSUE_STATUS_LABEL[candidate]}
            count={issues.filter((issue) => issue.status === candidate).length}
            active={candidate === status}
            onClick={() => selectStatus(candidate)}
          />
        ))}
      </div>

      {/* Above xl the rail holds the facets and this is only ever an
          "undo"; below it, the chips are the filter itself. One affordance
          at each width rather than two saying the same thing. */}
      {cause && (
        <button
          type="button"
          onClick={() => setCause(null)}
          className={cn(
            "mt-3 hidden items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 xl:inline-flex",
            "text-2xs font-medium text-muted transition-colors hover:text-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          )}
        >
          Showing {lower(CAUSE_LABEL[cause])} only
          <X className="size-3" aria-hidden />
          <span className="sr-only">Clear this filter</span>
        </button>
      )}

      {facets.length > 1 && (
        <CauseChips facets={facets} selected={cause} onSelect={setCause} />
      )}

      <div className="mt-4">
        {issuesQuery.isPending ? (
          <QueueSkeleton />
        ) : visible.length > 0 ? (
          <div className="overflow-hidden rounded-panel border border-line bg-elevated">
            {visible.map((issue) => (
              <ReviewIssueRow key={issue.id} issue={issue} />
            ))}
          </div>
        ) : (
          <QueueEmpty
            status={status}
            filtered={cause !== null}
            onClear={() => setCause(null)}
          />
        )}
      </div>
    </Page>
  );
}

/**
 * Left-anchored, like every other reading surface in the shell. The width
 * earned above 1280px goes to the facets, which are a real cut of the same
 * data rather than a decorative sidebar: "which kind of failure is costing us
 * the most" is the second question anyone asks here, and it is answered
 * without leaving the page or changing the list until you ask it to.
 */
function Page({
  children,
  rail,
}: {
  children: React.ReactNode;
  rail: React.ReactNode;
}) {
  return (
    <div className="px-5 py-8 sm:px-8 sm:py-12 xl:px-10">
      <div className="flex gap-10 2xl:gap-14">
        <div className="min-w-0 max-w-[52rem] flex-1">{children}</div>
        {rail && (
          <aside className="hidden w-[19rem] shrink-0 xl:block">{rail}</aside>
        )}
      </div>
    </div>
  );
}

function Header({
  issues = [],
  loading = false,
}: {
  issues?: ReviewIssue[];
  loading?: boolean;
}) {
  const lexicon = useLexicon();
  const open = issues.filter((issue) => issue.status === "open");
  const affected = totalAffected(open);

  return (
    <header>
      <p className="font-mono text-2xs tracking-wide text-faint uppercase">
        Work queue
      </p>
      <h1 className="mt-1.5 font-display text-3xl text-ink">Review</h1>

      {!loading && (
        <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">
          {open.length === 0 ? (
            <>Nothing is waiting to be fixed.</>
          ) : (
            <>
              <span className="font-medium text-ink tabular">{open.length}</span>{" "}
              {open.length === 1 ? "cause is" : "causes are"} open, between them
              affecting{" "}
              <span className="font-medium text-ink tabular">
                {count(affected, lexicon.conversation)}
              </span>
              . These are causes rather than incidents — fix one and every{" "}
              {lower(lexicon.conversation.one)} behind it stops repeating.
            </>
          )}
        </p>
      )}
    </header>
  );
}

function StatusTab({
  label,
  count: value,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-sm font-medium",
        "transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        active
          ? "bg-accent-surface text-ink"
          : "text-muted hover:bg-subtle hover:text-ink",
      )}
    >
      {label}
      <span
        className={cn(
          "font-mono text-2xs tabular",
          active ? "text-muted" : "text-faint",
        )}
      >
        {value}
      </span>
    </button>
  );
}

/**
 * The cause cut, for widths with no rail. Counts are conversations affected
 * rather than issues, exactly as the rail states them — a chip reading 43 and
 * a rail row reading 43 have to mean the same thing.
 */
function CauseChips({
  facets,
  selected,
  onSelect,
}: {
  facets: CauseFacet[];
  selected: IssueCause | null;
  onSelect: (cause: IssueCause | null) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 xl:hidden">
      {facets.map((facet) => {
        const active = facet.cause === selected;
        return (
          <button
            key={facet.cause}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(active ? null : facet.cause)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
              "text-2xs font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              active
                ? "border-line-strong bg-accent-surface text-ink"
                : "border-line text-muted hover:bg-subtle hover:text-ink",
            )}
          >
            {CAUSE_LABEL[facet.cause]}
            <span className="font-mono text-faint tabular">{facet.affected}</span>
            {active && <X className="size-3" aria-hidden />}
            {active && <span className="sr-only">Clear this filter</span>}
          </button>
        );
      })}
    </div>
  );
}

function Rail({
  issues,
  facets,
  selected,
  onSelect,
}: {
  issues: ReviewIssue[];
  facets: CauseFacet[];
  selected: IssueCause | null;
  onSelect: (cause: IssueCause | null) => void;
}) {
  const lexicon = useLexicon();

  if (facets.length === 0) return null;

  return (
    <div className="sticky top-8 space-y-7">
      <div>
        <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
          Blast radius
        </h2>
        <p className="mt-2 font-display text-2xl text-ink tabular">
          {totalAffected(issues).toLocaleString("en-GB")}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {lower(lexicon.conversation.many)} touched by the{" "}
          {issues.length === 1 ? "cause" : `${issues.length} causes`} in this
          list
        </p>
      </div>

      <div>
        <h2 className="mb-2.5 font-mono text-2xs tracking-wide text-faint uppercase">
          By cause
        </h2>
        <div className="overflow-hidden rounded-panel border border-line bg-elevated">
          {facets.map((facet) => {
            const active = facet.cause === selected;
            return (
              <button
                key={facet.cause}
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(active ? null : facet.cause)}
                className={cn(
                  "flex w-full items-baseline justify-between gap-3 border-b border-line px-3 py-2.5 text-left last:border-b-0",
                  "transition-colors",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
                  active ? "bg-accent-surface" : "hover:bg-subtle",
                )}
              >
                <span className="min-w-0 flex-1 truncate text-xs text-ink">
                  {CAUSE_LABEL[facet.cause]}
                </span>
                <span className="shrink-0 font-mono text-2xs text-faint tabular">
                  {facet.affected}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-2xs text-faint">
          Figures are {lower(lexicon.conversation.many)} affected, not the
          number of causes.
        </p>
      </div>
    </div>
  );
}

function QueueEmpty({
  status,
  filtered,
  onClear,
}: {
  status: IssueStatus;
  filtered: boolean;
  onClear: () => void;
}) {
  const lexicon = useLexicon();

  if (filtered) {
    return (
      <EmptyState
        tone="quiet"
        title="Nothing under that cause"
        description="Clear the filter to see the rest of the queue."
        action={
          <button
            type="button"
            onClick={onClear}
            className="text-sm font-medium text-ink underline underline-offset-4 hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Show every cause
          </button>
        }
      />
    );
  }

  if (status === "open") {
    return (
      <EmptyState
        title="Nothing needs reviewing"
        description={`A cause appears here when the AI hits something it could not handle on its own — a question with no approved answer, a connected system that did not respond, a rule that was ambiguous. Until then, the ${lower(lexicon.conversation.many)} it is handling are going through cleanly.`}
      />
    );
  }

  return (
    <EmptyState
      tone="quiet"
      title={`Nothing ${lower(ISSUE_STATUS_LABEL[status])}`}
      description="Causes move through this queue as they are picked up, fixed and verified. This tab fills as that happens."
    />
  );
}

function QueueSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-panel border border-line bg-elevated"
      aria-busy
    >
      <LoadingAnnouncement label="Loading the review queue" />
      {[0, 1, 2].map((row) => (
        <div key={row} className="border-b border-line px-4 py-4 last:border-b-0">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="mt-2.5 h-3.5 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
