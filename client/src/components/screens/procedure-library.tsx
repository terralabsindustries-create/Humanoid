"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import { useScope } from "@/lib/store/scope";
import {
  useDomainPack,
  useLexicon,
} from "@/components/providers/app-providers";
import { resolveNavLabel } from "@/lib/domains/registry";
import { Badge, Status, StatusPill } from "@/components/primitives/status";
import { EmptyState, ErrorState } from "@/components/primitives/empty-state";
import {
  LoadingAnnouncement,
  Skeleton,
} from "@/components/primitives/skeleton";
import { STEP_BLOCKER_LABEL, STEP_BLOCKER_TONE } from "@/lib/domain/labels";
import {
  blockedSteps,
  employeesRunning,
  mainPath,
  rankProcedures,
  totalStopped,
  weakestStep,
} from "@/lib/domain/procedures";
import { employeeName } from "@/lib/domain/tools";
import { lower } from "@/lib/lexicon";
import { percent } from "@/lib/utils/time";
import type {
  AIEmployee,
  Procedure,
  ReviewIssue,
  Tool,
} from "@/lib/domain/types";

/**
 * Procedures — what the AI has been told to do, step by step.
 *
 * The organising decision is that a procedure is ranked and summarised by
 * **what it loses**, not by how much it runs. A library sorted by popularity
 * puts the 612-run booking flow at the top and leaves the registration flow —
 * which drops one caller in five — three rows down looking like a minor one.
 * Lost runs is the product of both numbers, and it is what a manager would sort
 * by if they worked it out on paper.
 *
 * Each card therefore answers three questions before it is opened: is anyone
 * running it, where does it lose people, and can it still run at all. The last
 * of those is the join nothing else in the product makes — a procedure reads
 * perfectly while the connected system one of its steps depends on has been
 * timing out since 08:10, and nothing about reading it would tell you.
 *
 * Editing lives one level down, on the procedure itself, because a step cannot
 * be sensibly rewritten without the steps either side of it in view.
 */
export function ProcedureLibrary() {
  const scope = useScope();
  const lexicon = useLexicon();
  const domainPack = useDomainPack();

  const title = resolveNavLabel(
    "procedures",
    lexicon.procedure.many,
    domainPack,
  );

  const proceduresQuery = useQuery({
    queryKey: qk.procedures,
    queryFn: () => service.listProcedures(),
  });
  const toolsQuery = useQuery({
    queryKey: qk.tools,
    queryFn: () => service.listTools(),
  });
  const employeesQuery = useQuery({
    queryKey: qk.employees,
    queryFn: () => service.listEmployees(),
  });
  const issuesQuery = useQuery({
    queryKey: qk.issues(scope),
    queryFn: () => service.listReviewIssues(scope),
  });

  const procedures = useMemo(
    () => rankProcedures(proceduresQuery.data ?? []),
    [proceduresQuery.data],
  );
  const tools = useMemo(() => toolsQuery.data ?? [], [toolsQuery.data]);
  const employees = useMemo(
    () => employeesQuery.data ?? [],
    [employeesQuery.data],
  );

  /**
   * Review already tracks procedure faults as causes with a blast radius. This
   * screen does not restate them — it links, so the queue stays the one place a
   * fix is judged and this stays the one place the process is read.
   */
  const procedureIssues = useMemo(
    () =>
      (issuesQuery.data ?? []).filter(
        (issue) =>
          (issue.cause === "procedure_gap" ||
            issue.cause === "procedure_error") &&
          issue.status !== "resolved",
      ),
    [issuesQuery.data],
  );

  const loading = proceduresQuery.isPending || employeesQuery.isPending;

  if (proceduresQuery.isError) {
    return (
      <Page rail={null}>
        <Header title={title} />
        <ErrorState
          title={`Could not load ${lower(title)}`}
          detail="This list did not respond. Calls in progress are following the procedures they started with — this failure is limited to reading them."
          onRetry={() => proceduresQuery.refetch()}
        />
      </Page>
    );
  }

  return (
    <Page
      rail={
        loading ? null : (
          <Rail
            procedures={procedures}
            tools={tools}
            employees={employees}
            issues={procedureIssues}
          />
        )
      }
    >
      <Header
        title={title}
        procedures={procedures}
        loading={loading}
      />

      <div className="mt-7 space-y-3">
        {loading ? (
          <LibrarySkeleton />
        ) : procedures.length === 0 ? (
          <EmptyState
            title={`No ${lower(title)} yet`}
            description={`A ${lower(lexicon.procedure.one)} is the sequence your ${lower(lexicon.employee.one)} follows for one kind of request — what to ask, what to check, what to do, and what to do instead when it cannot. Until one exists it answers from knowledge alone and hands over anything that needs a decision.`}
          />
        ) : (
          procedures.map((procedure) => (
            <ProcedureCard
              key={procedure.id}
              procedure={procedure}
              tools={tools}
              employees={employees}
            />
          ))
        )}
      </div>
    </Page>
  );
}

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
  title,
  procedures = [],
  loading = false,
}: {
  title: string;
  procedures?: Procedure[];
  loading?: boolean;
}) {
  const lexicon = useLexicon();

  const active = procedures.filter((p) => p.status === "active");
  const lost = active.reduce((sum, p) => sum + totalStopped(p), 0);

  return (
    <header>
      <p className="font-mono text-2xs tracking-wide text-faint uppercase">
        Workspace assets
      </p>
      <h1 className="mt-1.5 font-display text-3xl text-ink">{title}</h1>

      {!loading && (
        <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">
          {procedures.length === 0 ? (
            <>Nothing is written down yet.</>
          ) : lost === 0 ? (
            <>
              <span className="font-medium text-ink tabular">
                {active.length}
              </span>{" "}
              {lower(
                active.length === 1
                  ? lexicon.procedure.one
                  : lexicon.procedure.many,
              )}{" "}
              {active.length === 1 ? "is" : "are"} in use, and{" "}
              {active.length === 1 ? "it finishes" : "they finish"} every{" "}
              {lower(lexicon.conversation.one)} that starts{" "}
              {active.length === 1 ? "it" : "them"}.
            </>
          ) : (
            <>
              <span className="font-medium text-ink tabular">
                {active.length}
              </span>{" "}
              {lower(
                active.length === 1
                  ? lexicon.procedure.one
                  : lexicon.procedure.many,
              )}{" "}
              {active.length === 1 ? "is" : "are"} in use. Between them they did
              not finish{" "}
              <span className="font-medium text-ink tabular">{lost}</span>{" "}
              {lost === 1 ? "run" : "runs"} — and almost all of that sits on a
              handful of steps rather than being spread evenly, which is what
              makes it fixable.
            </>
          )}
        </p>
      )}
    </header>
  );
}

/**
 * One procedure, summarised by consequence.
 *
 * The weakest step is named on the card rather than left for whoever opens it,
 * because the whole reason to open one of these is usually that something is
 * wrong with it — putting the answer behind a click means reading four
 * procedures to find the one that needed attention.
 */
function ProcedureCard({
  procedure,
  tools,
  employees,
}: {
  procedure: Procedure;
  tools: Tool[];
  employees: AIEmployee[];
}) {
  const lexicon = useLexicon();
  const runners = employeesRunning(procedure.id, employees);
  const blocked = blockedSteps(procedure, tools, runners);
  const weakest = weakestStep(procedure);
  const lost = totalStopped(procedure);

  return (
    <Link
      href={`/build/procedures/${procedure.id}`}
      className={cn(
        "group block rounded-panel border border-line bg-elevated px-4 py-4 sm:px-5",
        "transition-colors hover:border-line-strong hover:bg-subtle/40",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <h2 className="text-md font-medium text-ink">{procedure.name}</h2>
        <div className="flex items-center gap-2">
          {procedure.status === "draft" ? (
            <StatusPill tone="info">Not in use yet</StatusPill>
          ) : (
            <span className="font-mono text-2xs text-muted tabular">
              {percent(procedure.completionRate)} finish
            </span>
          )}
          <ArrowUpRight
            className="size-3.5 shrink-0 text-faint transition-colors group-hover:text-muted"
            aria-hidden
          />
        </div>
      </div>

      <p className="mt-1 max-w-prose text-sm text-muted">
        {procedure.description}
      </p>

      <p className="mt-2 text-2xs text-faint">
        Starts when: {lower(procedure.trigger)} · {procedure.steps.length} steps
        {procedure.runCount > 0 && (
          <>
            {" · "}
            <span className="tabular">{procedure.runCount}</span> runs
          </>
        )}
      </p>

      {/*
        The funnel as a strip. Not a chart and not decoration: each segment is
        one step, sized by how many runs reached it, so a procedure that loses
        people at step three looks visibly different from one that loses them at
        the end — which is the "visual map" this surface owes without becoming a
        node graph nobody edits.
      */}
      {procedure.runCount > 0 && (
        <FunnelStrip procedure={procedure} />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {runners.length === 0 ? (
          <Badge>Run by nobody</Badge>
        ) : (
          runners.map((employee) => (
            <Badge key={employee.id}>{employeeName(employee)}</Badge>
          ))
        )}

        {blocked.length > 0 && (
          <Status tone={STEP_BLOCKER_TONE[blocked[0].blocker.kind]} className="text-2xs">
            {blocked.length === 1
              ? STEP_BLOCKER_LABEL[blocked[0].blocker.kind]
              : `${blocked.length} steps cannot be relied on`}
          </Status>
        )}
      </div>

      {weakest && lost > 0 && (
        <p className="mt-2.5 border-t border-line pt-2.5 text-2xs text-muted">
          <span className="tabular">{weakest.step.stoppedCount}</span> of the{" "}
          <span className="tabular">{lost}</span>{" "}
          {lost === 1 ? "run" : "runs"} that did not finish stopped at one step:{" "}
          <span className="text-ink">{weakest.step.instruction}</span>
        </p>
      )}

      {procedure.status === "draft" && (
        <p className="mt-2.5 border-t border-line pt-2.5 text-2xs text-muted">
          Written but not in use — no {lower(lexicon.conversation.one)} has run
          it, and nothing here reaches a caller until it is published.
        </p>
      )}
    </Link>
  );
}

/**
 * Runs reaching each step, as bar heights on a common baseline.
 *
 * Height rather than opacity, which was the first attempt and was unreadable:
 * a 6% drop and a 40% drop rendered as two barely different greys, so the map
 * showed that a funnel existed without showing where it narrowed — the one
 * thing it is for. Height survives greyscale, small sizes and a glance.
 *
 * Monochrome on purpose. Every hue in this product is spoken for (rule 2), and
 * a funnel does not need one: the shape is the message, and the step that costs
 * the most is named in words directly underneath for anyone the shape does not
 * reach.
 */
function FunnelStrip({ procedure }: { procedure: Procedure }) {
  const spine = mainPath(procedure);
  const first = spine[0]?.reachedCount ?? 0;
  if (first === 0) return null;

  const last = spine[spine.length - 1]?.reachedCount ?? 0;

  return (
    <div
      className="mt-3 flex h-5 items-end gap-1"
      role="img"
      aria-label={`Funnel across ${spine.length} steps: ${first} runs reached the first, ${last} the last.`}
    >
      {spine.map((step) => (
        <span
          key={step.id}
          title={`${step.instruction} — ${step.reachedCount} reached`}
          className="w-full flex-1 rounded-[2px] bg-neutral/35"
          // A floor of 8% keeps a step nothing reached from vanishing: an
          // unreached step is a fact about the procedure, not an absence.
          style={{ height: `${Math.max(8, (step.reachedCount / first) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function Rail({
  procedures,
  tools,
  employees,
  issues,
}: {
  procedures: Procedure[];
  tools: Tool[];
  employees: AIEmployee[];
  issues: ReviewIssue[];
}) {
  const blocked = useMemo(
    () =>
      procedures.flatMap((procedure) =>
        blockedSteps(
          procedure,
          tools,
          employeesRunning(procedure.id, employees),
        ).map((entry) => ({ procedure, ...entry })),
      ),
    [procedures, tools, employees],
  );

  const unrun = procedures.filter(
    (procedure) =>
      procedure.status === "active" &&
      employeesRunning(procedure.id, employees).length === 0,
  );

  if (blocked.length === 0 && issues.length === 0 && unrun.length === 0) {
    return null;
  }

  return (
    <div className="sticky top-8 space-y-7">
      {blocked.length > 0 && (
        <RailSection
          label="Steps that cannot be relied on"
          note="Read against what the connected systems are actually doing right now, not against what the step says it needs."
        >
          <ul className="space-y-2.5">
            {blocked.map(({ procedure, step, blocker }) => (
              <li key={`${procedure.id}-${step.id}`}>
                <p className="text-xs font-medium text-ink">
                  {procedure.name}
                </p>
                <p className="mt-0.5 text-2xs text-muted">
                  {STEP_BLOCKER_LABEL[blocker.kind]}
                  {blocker.tool && <> — {blocker.tool.name}</>}
                </p>
              </li>
            ))}
          </ul>
        </RailSection>
      )}

      {issues.length > 0 && (
        <RailSection
          label="Already in Review"
          note="Review holds the fix and the blast radius. This surface holds the wording."
        >
          <ul className="space-y-1.5">
            {issues.map((issue) => (
              <li key={issue.id}>
                <Link
                  href={`/review/${issue.id}`}
                  className={cn(
                    "group -mx-1 flex items-start gap-1.5 rounded-control px-1 py-0.5",
                    "transition-colors hover:bg-subtle",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
                  )}
                >
                  <span className="min-w-0 flex-1 text-xs text-ink">
                    {issue.title}
                  </span>
                  <ArrowUpRight
                    className="mt-px size-3 shrink-0 text-faint transition-colors group-hover:text-muted"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </RailSection>
      )}

      {unrun.length > 0 && (
        <RailSection
          label="Written, granted to nobody"
          note="In use as a document and to nobody as a process — nothing will ever run these until an employee is granted them."
        >
          <ul className="space-y-1">
            {unrun.map((procedure) => (
              <li key={procedure.id} className="text-xs text-muted">
                {procedure.name}
              </li>
            ))}
          </ul>
        </RailSection>
      )}
    </div>
  );
}

function RailSection({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-2.5 font-mono text-2xs tracking-wide text-faint uppercase">
        {label}
      </h2>
      {children}
      {note && <p className="mt-2 text-2xs text-faint">{note}</p>}
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div className="space-y-3" aria-busy>
      <LoadingAnnouncement label="Loading procedures" />
      {[0, 1, 2].map((card) => (
        <div
          key={card}
          className="rounded-panel border border-line bg-elevated px-5 py-4"
        >
          <Skeleton className="h-4 w-52" />
          <Skeleton className="mt-2.5 h-3 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
          <Skeleton className="mt-3 h-1.5 w-full" />
        </div>
      ))}
    </div>
  );
}
