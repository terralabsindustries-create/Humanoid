"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import { useScope } from "@/lib/store/scope";
import { hasCapability } from "@/lib/navigation";
import {
  useDomainPack,
  useLexicon,
  useWorkspace,
} from "@/components/providers/app-providers";
import { resolveNavLabel } from "@/lib/domains/registry";
import { EmptyState, ErrorState } from "@/components/primitives/empty-state";
import { LoadingAnnouncement, Skeleton } from "@/components/primitives/skeleton";
import {
  DailyOutcomeColumns,
  OutcomeMixBar,
} from "@/components/domain/outcome-chart";
import { BLOCKER_SHORT } from "@/lib/domain/labels";
import {
  BLOCKER_REMEDY,
  bestNextFix,
  effortOver,
  formatDuration,
  formatPercent,
  formatPercentagePoints,
  issuesForBlocker,
  movement,
  share,
  totalOutcomes,
  type Movement,
} from "@/lib/domain/performance";
import { lower, withArticle, type Lexicon } from "@/lib/lexicon";
import type { PerformanceSummary, ReviewIssue } from "@/lib/domain/types";

/**
 * Performance.
 *
 * §3.8's rule for this surface is that it reports outcome and effort, never
 * sentiment and never a confidence score. So there is no satisfaction gauge and
 * no "AI accuracy" number here: there is what happened to the calls, how hard
 * the callers had to work, and why the ones that reached a person did.
 *
 * The registry names the job as "find which change would move the number",
 * which is a stronger claim than showing charts. It is met by joining the
 * escalation breakdown to the review queue: each reason carries the specific
 * open issue that would reduce it, and the rail states the single change with
 * the best case for being made next. A blocker with no issue behind it says so
 * rather than linking somewhere hopeful.
 *
 * The other half of that job is refusing to imply every escalation is a defect.
 * A caller who asks for a person should get one. `BLOCKER_REMEDY` splits the
 * reasons into the ones worth fixing and the ones that are the product working,
 * and the screen never totals them into a single number to be driven down.
 */
export function Performance() {
  const { user: viewer, loading: viewerLoading } = useWorkspace();
  const domainPack = useDomainPack();
  const lexicon = useLexicon();
  const scope = useScope();
  const [range, setRange] = useState<"7d" | "30d">("7d");

  const performanceQuery = useQuery({
    queryKey: qk.performance(range, scope),
    queryFn: () => service.getPerformance({ range, scope }),
  });

  // The same key and the same call the review queue uses, so the two surfaces
  // share one cache entry and cannot disagree about what is open.
  const issuesQuery = useQuery({
    queryKey: qk.issues(scope),
    queryFn: () => service.listReviewIssues(scope),
  });

  const title = resolveNavLabel("performance", "Performance", domainPack);
  const subtitle = `What happened to the ${lower(lexicon.call.many)}, and which change would move it.`;
  const summary = performanceQuery.data;
  const issues = useMemo(() => issuesQuery.data ?? [], [issuesQuery.data]);
  const mayReadIssues = hasCapability(viewer?.capabilities ?? [], "issue.read");
  const mayReadProcedures = hasCapability(
    viewer?.capabilities ?? [],
    "procedure.read",
  );

  if (performanceQuery.isError) {
    return (
      <Page rail={null}>
        <Header title={title} subtitle={subtitle} range={range} onRange={setRange} />
        <ErrorState
          title="Could not load performance"
          detail={`The reporting service did not respond. Nothing is wrong with the ${lower(lexicon.employee.many)} themselves — this failure is limited to reading their history, and live calls are unaffected.`}
          onRetry={() => void performanceQuery.refetch()}
        />
      </Page>
    );
  }

  if (viewerLoading || performanceQuery.isPending) {
    return (
      <Page rail={null}>
        <Header title={title} subtitle={subtitle} range={range} onRange={setRange} />
        <LoadingAnnouncement label="Loading performance" />
        <div className="mt-8 space-y-8">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Page>
    );
  }

  if (!summary || summary.points.length === 0) {
    return (
      <Page rail={null}>
        <Header title={title} subtitle={subtitle} range={range} onRange={setRange} />
        <EmptyState
          title="No history yet"
          description={`Once your ${lower(lexicon.employee.one)} has taken ${lower(lexicon.call.many)}, this is where their outcomes appear — what was resolved, what reached a person and why, and how hard callers had to work to be understood.`}
        />
      </Page>
    );
  }

  const totals = totalOutcomes(summary.points);
  const previous = totalOutcomes(summary.previousPoints);
  const effort = effortOver(summary.points);
  const previousEffort = effortOver(summary.previousPoints);
  const hasBaseline = previous.calls > 0;

  const resolutionRate = share(totals.resolved, totals.calls);
  const rateMovement = movement(
    resolutionRate,
    share(previous.resolved, previous.calls),
    "higher_is_better",
    0.005,
  );

  const periodLabel = range === "7d" ? "7 days" : "30 days";
  const nextFix = mayReadIssues
    ? bestNextFix(summary.blockerBreakdown, issues)
    : null;

  return (
    <Page
      rail={
        <Rail
          nextFix={nextFix}
          issuesPending={issuesQuery.isPending}
          mayReadIssues={mayReadIssues}
          escalated={totals.escalated}
          lexicon={lexicon}
        />
      }
    >
      <Header title={title} subtitle={subtitle} range={range} onRange={setRange} />

      <p className="mt-6 max-w-prose font-display text-2xl leading-snug text-ink">
        {formatPercent(resolutionRate)} of{" "}
        {totals.calls.toLocaleString("en-GB")} {lower(lexicon.call.many)}{" "}
        finished without a person.
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <Delta
          movement={rateMovement}
          text={formatPercentagePoints(rateMovement.delta)}
          hasBaseline={hasBaseline}
        />
        <span>
          {hasBaseline
            ? `against the previous ${periodLabel}`
            : `no previous ${periodLabel} to compare against`}
        </span>
      </p>

      <Section title={`What happened to the ${lower(lexicon.call.many)}`} className="mt-10">
        <OutcomeMixBar totals={totals} />
      </Section>

      <Section title="Day by day" className="mt-10">
        <DailyOutcomeColumns points={summary.points} />
      </Section>

      <Section
        title="How hard callers had to work"
        note={`Effort, not sentiment — this product counts what made ${withArticle(lexicon.call.one)} laborious rather than guessing at how anyone felt about it.`}
        className="mt-12"
      >
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-3">
          <Metric
            label={`Typical ${lower(lexicon.call.one)}`}
            value={formatDuration(effort.medianHandleTimeSeconds)}
            movement={movement(
              effort.medianHandleTimeSeconds,
              previousEffort.medianHandleTimeSeconds,
              "lower_is_better",
              3,
            )}
            text={`${effort.medianHandleTimeSeconds > previousEffort.medianHandleTimeSeconds ? "+" : "−"}${formatDuration(Math.abs(effort.medianHandleTimeSeconds - previousEffort.medianHandleTimeSeconds))}`}
            hasBaseline={hasBaseline}
          />
          <Metric
            label={`Clarifications per ${lower(lexicon.call.one)}`}
            value={effort.clarificationTurnsPerCall.toFixed(1)}
            movement={movement(
              effort.clarificationTurnsPerCall,
              previousEffort.clarificationTurnsPerCall,
              "lower_is_better",
              0.05,
            )}
            text={`${effort.clarificationTurnsPerCall >= previousEffort.clarificationTurnsPerCall ? "+" : "−"}${Math.abs(effort.clarificationTurnsPerCall - previousEffort.clarificationTurnsPerCall).toFixed(1)}`}
            hasBaseline={hasBaseline}
          />
          <Metric
            label="Callers who repeated themselves"
            value={formatPercent(effort.repeatRate)}
            movement={movement(
              effort.repeatRate,
              previousEffort.repeatRate,
              "lower_is_better",
              0.01,
            )}
            text={formatPercentagePoints(
              effort.repeatRate - previousEffort.repeatRate,
            )}
            hasBaseline={hasBaseline}
          />
        </div>
      </Section>

      <Escalations
        summary={summary}
        issues={issues}
        totals={totals}
        effortTransferRate={effort.transferRate}
        mayReadIssues={mayReadIssues}
        lexiconCall={lower(lexicon.call.many)}
      />

      <Section
        title={`Where ${lower(lexicon.procedure.many)} lose ${lower(lexicon.call.many)}`}
        note="A run that starts and does not finish is a caller who was promised something and did not get it."
        className="mt-12"
      >
        <ul className="space-y-4">
          {summary.procedureHealth.map((procedure) => (
            <li key={procedure.procedureId}>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium text-ink">
                  {mayReadProcedures ? (
                    <Link
                      href={`/build/procedures/${procedure.procedureId}`}
                      className="underline decoration-line underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      {procedure.name}
                    </Link>
                  ) : (
                    procedure.name
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums text-muted">
                  <Trend trend={procedure.trend} />
                  {formatPercent(procedure.completionRate)} completed
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-subtle">
                  {/* Neutral, not `ai`: a completion rate is a magnitude, and
                      the reserved hues answer "who is in control" only. */}
                  <div
                    className="h-full rounded-full bg-neutral"
                    style={{ width: `${procedure.completionRate * 100}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs tabular-nums text-faint">
                  {procedure.runs.toLocaleString("en-GB")} runs
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <p className="mt-12 max-w-prose border-t border-line pt-5 text-xs leading-relaxed text-faint">
        Outcomes and effort are counted from {lower(lexicon.call.many)} the{" "}
        {lower(lexicon.employee.many)} handled. What is deliberately absent:
        any measure of how a caller felt, any single quality score, and any
        confidence percentage — none of them can be acted on, and all three
        invite a number to be managed instead of a cause to be fixed.
      </p>
    </Page>
  );
}

// ──────────────────────────────────────────────────────────────── escalations

function Escalations({
  summary,
  issues,
  totals,
  effortTransferRate,
  mayReadIssues,
  lexiconCall,
}: {
  summary: PerformanceSummary;
  issues: ReviewIssue[];
  totals: { escalated: number; calls: number };
  effortTransferRate: number;
  mayReadIssues: boolean;
  lexiconCall: string;
}) {
  const fixable = summary.blockerBreakdown.filter(
    (entry) => BLOCKER_REMEDY[entry.blocker].kind === "fixable",
  );
  const byDesign = summary.blockerBreakdown.filter(
    (entry) => BLOCKER_REMEDY[entry.blocker].kind === "by_design",
  );
  const fixableCount = fixable.reduce((n, entry) => n + entry.count, 0);

  return (
    <Section
      title={`Why ${lexiconCall} reach a person`}
      note={`${totals.escalated.toLocaleString("en-GB")} of ${totals.calls.toLocaleString("en-GB")} ${lexiconCall} (${formatPercent(effortTransferRate)}) were handed over. ${fixableCount.toLocaleString("en-GB")} of those had a cause worth fixing; the rest are the product working as it should.`}
      className="mt-12"
    >
      {summary.blockerBreakdown.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing was handed to a person in this period.
        </p>
      ) : (
        <div className="space-y-8">
          <BlockerGroup
            heading="Worth fixing"
            entries={fixable}
            escalated={totals.escalated}
            issues={issues}
            mayReadIssues={mayReadIssues}
          />
          <BlockerGroup
            heading="Working as intended"
            entries={byDesign}
            escalated={totals.escalated}
            issues={issues}
            mayReadIssues={mayReadIssues}
          />
        </div>
      )}
    </Section>
  );
}

function BlockerGroup({
  heading,
  entries,
  escalated,
  issues,
  mayReadIssues,
}: {
  heading: string;
  entries: { blocker: PerformanceSummary["blockerBreakdown"][number]["blocker"]; count: number }[];
  escalated: number;
  issues: ReviewIssue[];
  mayReadIssues: boolean;
}) {
  if (entries.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-faint">
        {heading}
      </h3>
      <ul className="mt-3 space-y-5">
        {entries.map((entry) => {
          const remedy = BLOCKER_REMEDY[entry.blocker];
          const [issue] = mayReadIssues
            ? issuesForBlocker(entry.blocker, issues)
            : [];
          return (
            <li key={entry.blocker}>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium text-ink">
                  {BLOCKER_SHORT[entry.blocker]}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-muted">
                  {entry.count}
                  <span className="text-faint">
                    {" · "}
                    {formatPercent(share(entry.count, escalated))}
                  </span>
                </span>
              </div>
              {/* One hue: this is magnitude within a single category, not four
                  identities that need telling apart. */}
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-subtle">
                <div
                  className="h-full rounded-full bg-human"
                  style={{ width: `${share(entry.count, escalated) * 100}%` }}
                />
              </div>
              <p className="mt-2 max-w-prose text-sm text-muted">
                {remedy.remedy}
              </p>
              {issue ? (
                <Link
                  href={`/review/${issue.id}`}
                  className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {issue.title}
                  <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              ) : remedy.kind === "fixable" && mayReadIssues ? (
                <p className="mt-1.5 text-xs text-faint">
                  No open issue names this yet — the review queue has not found
                  a repeatable cause behind these.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────── rail

function Rail({
  nextFix,
  issuesPending,
  mayReadIssues,
  escalated,
  lexicon,
}: {
  nextFix: ReturnType<typeof bestNextFix>;
  issuesPending: boolean;
  mayReadIssues: boolean;
  escalated: number;
  lexicon: Lexicon;
}) {
  if (!mayReadIssues) return null;

  return (
    <div className="sticky top-8">
      <h2 className="text-xs font-medium uppercase tracking-wide text-faint">
        The change worth making next
      </h2>
      {issuesPending ? (
        <Skeleton className="mt-3 h-24 w-full" />
      ) : nextFix ? (
        <div className="mt-3">
          <p className="text-sm leading-relaxed text-muted">
            {BLOCKER_SHORT[nextFix.blocker]} accounts for{" "}
            <span className="tabular-nums text-ink">
              {formatPercent(share(nextFix.count, escalated))}
            </span>{" "}
            of hand-overs, and one open issue explains them.
          </p>
          <Link
            href={`/review/${nextFix.issue.id}`}
            className="mt-3 block rounded-md border border-line bg-elevated p-3.5 transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <span className="text-sm font-medium text-ink">
              {nextFix.issue.title}
            </span>
            <span className="mt-1 block text-xs text-muted">
              Affects {nextFix.issue.affectedConversationCount}{" "}
              {lower(lexicon.conversation.many)}
            </span>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-ink">
              Open in review
              <ArrowRight aria-hidden className="size-3" />
            </span>
          </Link>
        </div>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Nothing here has a named cause behind it. The hand-overs left are the
          ones that are supposed to happen — a rule that needs a person, or a
          caller who asked for one.
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────── furniture

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
        <div className="min-w-0 max-w-[42rem] flex-1">{children}</div>
        {rail && (
          <aside className="hidden w-[19rem] shrink-0 xl:block">{rail}</aside>
        )}
      </div>
    </div>
  );
}

function Header({
  title,
  subtitle,
  range,
  onRange,
}: {
  title: string;
  subtitle: string;
  range: "7d" | "30d";
  onRange: (range: "7d" | "30d") => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl text-ink">{title}</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted">{subtitle}</p>
      </div>
      <div
        role="group"
        aria-label="Period"
        className="flex shrink-0 rounded-md border border-line p-0.5"
      >
        {(["7d", "30d"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={range === option}
            onClick={() => onRange(option)}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              range === option
                ? "bg-subtle text-ink"
                : "text-muted hover:text-ink",
            )}
          >
            {option === "7d" ? "7 days" : "30 days"}
          </button>
        ))}
      </div>
    </div>
  );
}

function Section({
  title,
  note,
  children,
  className,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="text-sm font-medium text-ink">{title}</h2>
      {note ? (
        <p className="mt-1 max-w-prose text-sm text-muted">{note}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Metric({
  label,
  value,
  movement: m,
  text,
  hasBaseline,
}: {
  label: string;
  value: string;
  movement: Movement;
  text: string;
  hasBaseline: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl tabular-nums text-ink">{value}</p>
      <p className="mt-1">
        <Delta movement={m} text={text} hasBaseline={hasBaseline} />
      </p>
    </div>
  );
}

/**
 * A movement against the previous period.
 *
 * The arrow shows which way the number went; the colour and the screen-reader
 * word say whether that is good news. They are separate because they are
 * genuinely separate facts — a falling handle time is a down arrow and an
 * improvement at the same time, and an interface that conflates them has to
 * choose which of the two to lie about.
 */
function Delta({
  movement: m,
  text,
  hasBaseline,
}: {
  movement: Movement;
  text: string;
  hasBaseline: boolean;
}) {
  if (!hasBaseline) {
    return <span className="text-xs text-faint">No baseline</span>;
  }

  const Icon = m.direction === "flat" ? Minus : m.delta > 0 ? ArrowUp : ArrowDown;
  const tone =
    m.direction === "flat"
      ? "text-faint"
      : m.direction === "better"
        ? "text-success"
        : "text-danger";

  return (
    <span className={cn("inline-flex items-center gap-1 text-xs tabular-nums", tone)}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {m.direction === "flat" ? "No change" : text}
      <span className="sr-only">
        {m.direction === "flat"
          ? ""
          : m.direction === "better"
            ? ", better"
            : ", worse"}
      </span>
    </span>
  );
}

function Trend({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "flat") {
    return (
      <span className="inline-flex items-center gap-1 text-faint">
        <Minus aria-hidden className="size-3.5" />
        <span className="sr-only">Steady</span>
      </span>
    );
  }
  const Icon = trend === "up" ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        trend === "up" ? "text-success" : "text-danger",
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      <span className="sr-only">{trend === "up" ? "Improving" : "Worsening"}</span>
    </span>
  );
}
