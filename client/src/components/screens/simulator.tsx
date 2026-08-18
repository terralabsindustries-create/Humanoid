"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Circle,
  Loader2,
  Lock,
  Minus,
  Play,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import {
  useDomainPack,
  useLexicon,
  useWorkspace,
} from "@/components/providers/app-providers";
import { Button } from "@/components/primitives/button";
import { Badge, Status, StatusPill, type Tone } from "@/components/primitives/status";
import { EmptyState, ErrorState } from "@/components/primitives/empty-state";
import {
  LoadingAnnouncement,
  Skeleton,
} from "@/components/primitives/skeleton";
import { SimulationSurface } from "@/components/domain/simulation-chrome";
import {
  DIFFICULTY_LABEL,
  SCENARIO_ORIGIN_LABEL,
  SCENARIO_RESULT_LABEL,
  SCENARIO_RESULT_TONE,
} from "@/lib/domain/labels";
import { gateForVersion } from "@/lib/domain/releases";
import {
  coverage,
  resultsByScenario,
  simulatedSeconds,
  suiteStandings,
  unrunSuites,
  type SuiteStanding,
  type SuiteStandingState,
} from "@/lib/domain/simulation";
import { lower, withArticle } from "@/lib/lexicon";
import { hasCapability, navItemById, resolveLabel } from "@/lib/navigation";
import { resolveNavLabel } from "@/lib/domains/registry";
import { duration, relativeLong } from "@/lib/utils/time";
import type {
  AIEmployee,
  EmployeeVersion,
  Scenario,
  ScenarioResult,
  ScenarioResultStatus,
  ScenarioSuite,
  SimulationRun,
  User,
} from "@/lib/domain/types";

/**
 * Simulator — rehearsal before a customer meets a change.
 *
 * The screen answers one question, and the layout exists to keep that question
 * from being answered vaguely: **has this specific draft been rehearsed, and
 * what did the rehearsal find?**
 *
 * Four decisions follow from that:
 *
 * 1. **Everything is anchored to a version, never to an employee.** The heading
 *    names the draft, each suite reports what it found *against this draft*, and
 *    a result from an earlier version is marked stale rather than counted. A
 *    green tick that actually belongs to last week's configuration is the single
 *    most dangerous thing this surface could render — it would tell someone
 *    their untested change had been tested.
 * 2. **Unrun is a state, shown as loudly as failed.** A suite nobody has run is
 *    not a blank row; it is the reason the verdict at the top is incomplete, and
 *    it is what the primary action does something about.
 * 3. **No scores.** A suite reports which scenarios did what, and every finding
 *    is the sentence describing it (rule 4). "9 of 11" is a fact about the run;
 *    "84% ready" would be an invention.
 * 4. **The gate is the same gate Releases uses.** `gateForVersion` is imported
 *    rather than reimplemented, so this screen and the publish button can never
 *    disagree about whether a draft is clear.
 *
 * The whole surface is wrapped in `SimulationSurface` — arch §8's requirement
 * that a simulation is never mistakable for a live call, and vice versa.
 *
 * Runs really do run here, against the mock's session-lived copy, and results
 * land one scenario at a time so the in-flight state is a real state rather than
 * a spinner. What they do not do is rehearse anything: there is no AI runtime
 * behind this, so a run replays a recorded verdict rather than discovering one.
 * See `services/mock.ts`.
 */
export function Simulator() {
  const { user, loading: workspaceLoading } = useWorkspace();
  const lexicon = useLexicon();
  const capabilities = user?.capabilities ?? [];
  const queryClient = useQueryClient();

  const suitesQuery = useQuery({
    queryKey: qk.scenarioSuites,
    queryFn: () => service.listScenarioSuites(),
  });
  const scenariosQuery = useQuery({
    queryKey: qk.scenarios,
    queryFn: () => service.listScenarios(),
  });
  const employeesQuery = useQuery({
    queryKey: qk.employees,
    queryFn: () => service.listEmployees(),
  });
  const usersQuery = useQuery({
    queryKey: qk.users,
    queryFn: () => service.listUsers(),
  });

  /**
   * Polled only while something is actually in flight, and driven by the data
   * rather than by a piece of component state — a boolean set in an effect goes
   * stale the moment a run finishes in another tab, and this cannot.
   */
  const runsQuery = useQuery({
    queryKey: qk.simulationRuns,
    queryFn: () => service.listSimulationRuns(),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((run) => run.status === "running")
        ? 400
        : false,
  });

  const suites = useMemo(() => suitesQuery.data ?? [], [suitesQuery.data]);
  const scenarios = useMemo(
    () => scenariosQuery.data ?? [],
    [scenariosQuery.data],
  );
  const runs = useMemo(() => runsQuery.data ?? [], [runsQuery.data]);
  const employees = useMemo(
    () => employeesQuery.data ?? [],
    [employeesQuery.data],
  );

  /**
   * Only employees with a draft can be rehearsed. Simulating what is already
   * live is a different activity — it tells you about the past, not about a
   * decision waiting to be made — and offering it here would blur the one thing
   * this screen is for.
   */
  const draftable = useMemo(
    () => employees.filter((employee) => employee.draftVersion),
    [employees],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const employee =
    draftable.find((candidate) => candidate.id === selectedId) ??
    draftable[0] ??
    null;
  const version = employee?.draftVersion ?? null;

  const standings = useMemo(
    () =>
      employee
        ? suiteStandings(suites, runs, employee.id, version?.id ?? null)
        : [],
    [suites, runs, employee, version],
  );

  const gate = useMemo(
    () => gateForVersion(version?.id ?? null, runs, scenarios),
    [version, runs, scenarios],
  );

  const runMutation = useMutation({
    mutationFn: async (suiteIds: string[]) => {
      if (!employee || !version) throw new Error("No draft to rehearse");
      // One run per suite, because that is what a run *is* in the model. The
      // suites go off together rather than in sequence: they are independent,
      // and a person who asked for all of them should not wait for the first to
      // finish before the second starts.
      return Promise.all(
        suiteIds.map((suiteId) =>
          service.startSimulationRun({
            suiteId,
            employeeId: employee.id,
            employeeVersionId: version.id,
          }),
        ),
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: qk.simulationRuns }),
  });

  // The capability check waits for the real user, or a hard reload paints a
  // refusal at every visitor for a moment before the fetch lands.
  if (!workspaceLoading && !hasCapability(capabilities, "simulation.run")) {
    return (
      <Frame rail={null}>
        <Header />
        <NoAccess />
      </Frame>
    );
  }

  if (suitesQuery.isError || employeesQuery.isError) {
    return (
      <Frame rail={null}>
        <Header />
        <ErrorState
          title="Could not load the scenario suites"
          detail={`The simulation service did not respond. Nothing was run, and nothing about what is answering ${lower(lexicon.call.many)} has changed — this failure is limited to this screen.`}
          onRetry={() => {
            void suitesQuery.refetch();
            void employeesQuery.refetch();
          }}
        />
      </Frame>
    );
  }

  const loading =
    suitesQuery.isPending || employeesQuery.isPending || workspaceLoading;

  if (loading) {
    return (
      <Frame rail={null}>
        <Header loading />
        <LoadingAnnouncement label="Loading scenario suites" />
        <SimulatorSkeleton />
      </Frame>
    );
  }

  if (suites.length === 0) {
    return (
      <Frame rail={null}>
        <Header />
        <NoSuites />
      </Frame>
    );
  }

  if (!employee || !version) {
    return (
      <Frame rail={null}>
        <Header />
        <NoDraft capabilities={capabilities} />
      </Frame>
    );
  }

  const outstanding = unrunSuites(standings);
  const running = standings.filter((s) => s.state === "running");

  return (
    <Frame
      rail={
        <Rail
          employee={employee}
          version={version}
          scenarios={scenarios}
          runs={runs}
          suites={suites}
          users={usersQuery.data ?? []}
        />
      }
    >
      <Header />

      {draftable.length > 1 && (
        <DraftPicker
          employees={draftable}
          selectedId={employee.id}
          onSelect={setSelectedId}
        />
      )}

      <Verdict
        version={version}
        standings={standings}
        outstanding={outstanding}
        running={running}
        failures={gate?.failures ?? 0}
        warnings={gate?.warnings ?? 0}
        capabilities={capabilities}
        onRun={(suiteIds) => runMutation.mutate(suiteIds)}
        pending={runMutation.isPending}
        pendingSuiteIds={runMutation.variables ?? []}
        error={runMutation.isError}
      />

      <div className="mt-9 space-y-5">
        {standings.map((standing) => (
          <SuiteCard
            key={standing.suite.id}
            standing={standing}
            scenarios={scenarios}
            users={usersQuery.data ?? []}
            onRun={() => runMutation.mutate([standing.suite.id])}
            pending={
              runMutation.isPending &&
              (runMutation.variables ?? []).includes(standing.suite.id)
            }
          />
        ))}
      </div>
    </Frame>
  );
}

/* ─────────────────────────────────────────────────────────── frame + header */

/**
 * Left-anchored like every reading surface here (rule 7), with the width above
 * 1280px going to what is being rehearsed and what the suites actually cover —
 * the two facts that give every result below its meaning, and the ones you
 * should not have to scroll back up to check.
 *
 * The padding lives inside `SimulationSurface` rather than around it, so the
 * hatched edge and the sticky label span the full pane.
 */
function Frame({
  children,
  rail,
}: {
  children: React.ReactNode;
  rail: React.ReactNode;
}) {
  return (
    <SimulationSurface>
      <div className="px-5 py-8 sm:px-8 sm:py-10 xl:px-10">
        <div className="flex gap-10 2xl:gap-14">
          <div className="min-w-0 max-w-[52rem] flex-1">{children}</div>
          {rail && (
            <aside className="hidden w-[19rem] shrink-0 xl:block">{rail}</aside>
          )}
        </div>
      </div>
    </SimulationSurface>
  );
}

function Header({ loading = false }: { loading?: boolean }) {
  const lexicon = useLexicon();

  return (
    <header>
      <p className="font-mono text-2xs tracking-wide text-faint uppercase">
        Rehearsal
      </p>
      <h1 className="mt-1.5 font-display text-3xl text-ink">Simulator</h1>

      {!loading && (
        <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">
          Put a draft through the {lower(lexicon.call.many)} you would dread
          taking yourself, before a real {lower(lexicon.party.one)} makes one.
          Every scenario is scripted, and the results are the only thing that
          leaves this screen.
        </p>
      )}
    </header>
  );
}

/* ────────────────────────────────────────────────────────────── draft picker */

/**
 * Only rendered when more than one draft exists, because a picker with one
 * option is furniture. Toggle buttons rather than tabs: nothing is being
 * revealed and hidden, the entire page is about whichever draft is chosen, and
 * `aria-pressed` says that more accurately than a tablist would.
 */
function DraftPicker({
  employees,
  selectedId,
  onSelect,
}: {
  employees: AIEmployee[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const lexicon = useLexicon();

  return (
    <div className="mt-7">
      <p className="font-mono text-2xs tracking-wide text-faint uppercase">
        Drafts waiting to be rehearsed
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {employees.map((employee) => {
          const selected = employee.id === selectedId;
          const name =
            employee.draftVersion?.persona.name ??
            employee.liveVersion?.persona.name ??
            lexicon.employee.one;

          return (
            <button
              key={employee.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(employee.id)}
              className={cn(
                "inline-flex items-baseline gap-2 rounded-control border px-3 py-1.5",
                "text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                selected
                  ? "border-line-strong bg-elevated font-medium text-ink"
                  : "border-line text-muted hover:bg-elevated hover:text-ink",
              )}
            >
              {name}
              <span className="font-mono text-2xs text-faint tabular">
                v{employee.draftVersion?.version}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── verdict */

/**
 * The state of the draft in one paragraph, and the action that changes it.
 *
 * Written as sentences rather than as a dashboard of counters on purpose: the
 * useful output of a rehearsal is "two suites have not been run against this
 * draft", which is a sentence, and a row of numbers would leave the reader to
 * assemble it themselves and possibly get it wrong.
 */
function Verdict({
  version,
  standings,
  outstanding,
  running,
  failures,
  warnings,
  capabilities,
  onRun,
  pending,
  pendingSuiteIds,
  error,
}: {
  version: EmployeeVersion;
  standings: SuiteStanding[];
  outstanding: SuiteStanding[];
  running: SuiteStanding[];
  failures: number;
  warnings: number;
  capabilities: string[];
  onRun: (suiteIds: string[]) => void;
  pending: boolean;
  pendingSuiteIds: string[];
  error: boolean;
}) {
  const lexicon = useLexicon();
  const total = standings.length;
  const current = total - outstanding.length;
  const draft = `draft v${version.version}`;

  const allSuiteIds = standings.map((standing) => standing.suite.id);
  const outstandingIds = outstanding.map((standing) => standing.suite.id);

  return (
    <section className="mt-7 rounded-panel border border-line bg-app px-5 py-5">
      <p className="max-w-prose text-md leading-relaxed text-ink">
        {running.length > 0 ? (
          <>
            Rehearsing {draft} now —{" "}
            <span className="font-medium tabular">{running.length}</span>{" "}
            {plural(running.length, "suite", "suites")} running.
          </>
        ) : current === 0 ? (
          <>
            Nothing has been rehearsed against {draft} yet. Until a suite runs
            against this version, there is nothing here that says whether the
            change is safe.
          </>
        ) : outstanding.length > 0 ? (
          <>
            <span className="font-medium tabular">{current}</span> of{" "}
            <span className="tabular">{total}</span> suites{" "}
            {plural(current, "has", "have")} been run against {draft}.{" "}
            {outstanding.length === 1
              ? "One has not"
              : `${outstanding.length} have not`}
            , so what they would find is still unknown.
          </>
        ) : failures + warnings > 0 ? (
          <>
            All {total} suites have been run against {draft}.{" "}
            <span className="font-medium">
              {describeFindings(failures, warnings)}
            </span>
          </>
        ) : (
          <>
            All {total} suites passed against {draft}. Nothing in the scripted{" "}
            {lower(lexicon.call.many)} went wrong.
          </>
        )}
      </p>

      {/*
       * One button per distinct outcome. When nothing has been run yet,
       * "run the outstanding" and "run everything" are the same act, and
       * offering both would be two controls with one effect — the reader has to
       * work out they are identical, and whichever they pick they will wonder
       * what the other would have done.
       */}
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {outstanding.length > 0 && current > 0 && (
          <Button
            variant="primary"
            icon={<Play className="size-3.5" aria-hidden />}
            loading={pending && sameSet(pendingSuiteIds, outstandingIds)}
            disabled={pending || running.length > 0}
            onClick={() => onRun(outstandingIds)}
          >
            Run the {outstanding.length} outstanding
          </Button>
        )}

        <Button
          variant={outstanding.length > 0 && current > 0 ? "secondary" : "primary"}
          icon={
            current === 0 ? (
              <Play className="size-3.5" aria-hidden />
            ) : (
              <RotateCcw className="size-3.5" aria-hidden />
            )
          }
          loading={pending && sameSet(pendingSuiteIds, allSuiteIds)}
          disabled={pending || running.length > 0}
          onClick={() => onRun(allSuiteIds)}
        >
          {current === 0
            ? `Run all ${total} suites`
            : outstanding.length > 0
              ? "Run everything"
              : "Run everything again"}
        </Button>

        <ReleasesLink capabilities={capabilities} />
      </div>

      {error && (
        <p className="mt-3 text-sm text-danger">
          The run could not be started. Nothing was rehearsed — try again.
        </p>
      )}
    </section>
  );
}

/** "One scenario failed and one raised a problem." Never a percentage. */
function describeFindings(failures: number, warnings: number): string {
  const parts: string[] = [];
  if (failures > 0) {
    parts.push(
      `${spellOut(failures)} ${plural(failures, "scenario", "scenarios")} failed`,
    );
  }
  if (warnings > 0) {
    parts.push(
      failures > 0
        ? `${spellOut(warnings)} raised a problem`
        : `${spellOut(warnings)} ${plural(warnings, "scenario", "scenarios")} raised a problem`,
    );
  }
  // It follows a full stop, so it is the start of a sentence.
  const sentence = parts.join(" and ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

/**
 * Where the decision this rehearsal feeds actually gets made. The Simulator
 * deliberately cannot publish: rehearsing and shipping are different acts by
 * different people, and arch §12's change-control model keeps the second one on
 * the Releases surface with its written reason and its acknowledgements.
 */
function ReleasesLink({ capabilities }: { capabilities: string[] }) {
  const lexicon = useLexicon();
  const pack = useDomainPack();
  const item = navItemById("releases");

  if (!item || !hasCapability(capabilities, item.capability)) return null;

  const label = resolveNavLabel(
    item.id,
    resolveLabel(item.label, lexicon),
    pack,
  );

  return (
    <Link
      href={item.href}
      className="ml-auto text-sm font-medium text-ink underline underline-offset-4 hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      Publishing happens in {label}
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────────── suite card */

/**
 * `info` rather than `ai` for a run in flight, and the reason is rule 2 read
 * strictly. The `ai` hue answers "who is holding this conversation", and a
 * rehearsal has no conversation and no caller — tinting it with the live-AI
 * colour would produce exactly the confusion §8's chrome exists to prevent.
 */
const STANDING_TONE: Record<SuiteStandingState, Tone> = {
  running: "info",
  never_run: "neutral",
  stale: "warning",
  passed: "success",
  warning: "warning",
  failed: "danger",
};

function SuiteCard({
  standing,
  scenarios,
  users,
  onRun,
  pending,
}: {
  standing: SuiteStanding;
  scenarios: Scenario[];
  users: User[];
  onRun: () => void;
  pending: boolean;
}) {
  const { suite, state, run } = standing;
  const results = resultsByScenario(run);
  const isRunning = state === "running";
  const needsFirstRun = state === "never_run" || state === "stale";

  const suiteScenarios = suite.scenarioIds
    .map((id) => scenarios.find((scenario) => scenario.id === id))
    .filter((scenario): scenario is Scenario => Boolean(scenario));

  return (
    <article className="rounded-panel border border-line bg-app">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 pt-4.5 pb-4">
        <div className="min-w-0">
          <h2 className="text-md font-medium text-ink">{suite.name}</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            {suite.description}
          </p>
        </div>
        {/*
         * "Re-run" only when there is already a result for *this* draft. A
         * stale suite has never been run against it, so calling that a re-run
         * would imply the evidence it is about to replace was relevant.
         */}
        <Button
          size="sm"
          variant={needsFirstRun ? "primary" : "secondary"}
          icon={<Play className="size-3" aria-hidden />}
          loading={pending}
          disabled={pending || isRunning}
          onClick={onRun}
        >
          {needsFirstRun ? "Run" : "Re-run"}
        </Button>
      </header>

      <div className="border-t border-line px-5 py-3">
        <StandingLine
          standing={standing}
          users={users}
          scenarioCount={suite.scenarioIds.length}
        />
      </div>

      <ol className="border-t border-line">
        {suiteScenarios.map((scenario, index) => {
          const recorded = results.get(scenario.id) ?? null;
          return (
            <ScenarioRow
              key={scenario.id}
              scenario={scenario}
              /*
               * On a stale suite the marks are withheld rather than dimmed. A
               * green tick earned by an earlier version is a claim about this
               * draft that nobody has tested, and no amount of surrounding
               * caveat outranks a row of ticks — the reader scans the marks and
               * reads the prose second, if at all.
               */
              result={standing.stale ? null : recorded}
              /* The finding survives, because "this failed last time" is worth
               * knowing. It just gets attributed instead of counted. */
              priorResult={standing.stale ? recorded : null}
              /*
               * A scenario with no result yet inside a run that is still going is
               * queued, not skipped. The distinction matters: skipped is a verdict
               * and queued is the absence of one.
               */
              queued={isRunning}
              first={index === 0}
            />
          );
        })}
      </ol>
    </article>
  );
}

/** What this suite currently says about this draft, and how much to trust it. */
function StandingLine({
  standing,
  users,
  scenarioCount,
}: {
  standing: SuiteStanding;
  users: User[];
  scenarioCount: number;
}) {
  const lexicon = useLexicon();
  const { state, run, stale, tally } = standing;
  const tone = STANDING_TONE[state];
  const who = users.find((user) => user.id === run?.triggeredByUserId)?.name;

  const label =
    state === "running"
      ? "Rehearsing"
      : state === "never_run"
        ? "Never run"
        : state === "stale"
          ? "Not run against this draft"
          : SCENARIO_RESULT_LABEL[state];

  const icon =
    state === "running" ? (
      <Loader2 className="size-3 animate-spin" aria-hidden />
    ) : state === "never_run" ? (
      <Circle className="size-3" aria-hidden />
    ) : state === "stale" ? (
      <TriangleAlert className="size-3" aria-hidden />
    ) : (
      <ResultIcon status={state} />
    );

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <Status tone={tone} icon={icon}>
        {label}
      </Status>

      <span className="text-xs text-muted tabular">
        {state === "running"
          ? `${tally.total} of ${scenarioCount} scenarios done`
          : `${scenarioCount} ${plural(scenarioCount, "scenario", "scenarios")}`}
      </span>

      {run && state !== "running" && (
        <span className="text-xs text-muted">
          {stale ? "Last ran" : "Ran"}{" "}
          {relativeLong(run.finishedAt ?? run.startedAt)}
          {who && <> by {who}</>}
          {tally.total > 0 && (
            <>
              {" · "}
              <span className="tabular">
                {duration(simulatedSeconds(run.results))}
              </span>{" "}
              of scripted {lower(lexicon.call.many)}
            </>
          )}
        </span>
      )}

      {/*
       * The version is named, not implied. This is the line that stops a pass
       * against an older draft from reading as a pass against this one.
       */}
      {stale && run && (
        <span className="text-xs text-warning">
          Last run was against an earlier version — these results say nothing
          about the current draft.
        </span>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── scenario row */

const RESULT_ICON: Record<ScenarioResultStatus, typeof Check> = {
  passed: Check,
  failed: X,
  warning: TriangleAlert,
  skipped: Minus,
};

function ResultIcon({ status }: { status: ScenarioResultStatus }) {
  const Icon = RESULT_ICON[status];
  return <Icon className="size-3" aria-hidden />;
}

/**
 * One scripted call.
 *
 * Both the caller's intent and what the AI was supposed to do are on the row,
 * because "passed" is meaningless without the second one — a pass is only as
 * good as the expectation it was measured against, and hiding that behind a
 * disclosure would turn a verdict into a claim you have to take on faith.
 */
function ScenarioRow({
  scenario,
  result,
  priorResult,
  queued,
  first,
}: {
  scenario: Scenario;
  /** A verdict about the current draft. Renders a mark. */
  result: ScenarioResult | null;
  /** A verdict about an earlier version. Renders as history, never as a mark. */
  priorResult: ScenarioResult | null;
  queued: boolean;
  first: boolean;
}) {
  return (
    <li
      className={cn(
        "flex gap-3 px-5 py-3.5",
        !first && "border-t border-line",
        // A row still waiting inside a live run recedes, so the eye lands on
        // whatever just resolved rather than on the queue below it.
        queued && !result && "opacity-55",
      )}
    >
      <span className="mt-0.5 shrink-0">
        {result ? (
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-full",
              MARK_SURFACE[result.status],
            )}
          >
            <ResultIcon status={result.status} />
          </span>
        ) : queued ? (
          <span className="flex size-5 items-center justify-center rounded-full bg-neutral-surface text-muted">
            <Loader2 className="size-3 animate-spin" aria-hidden />
          </span>
        ) : (
          <span className="flex size-5 items-center justify-center rounded-full border border-dashed border-line-strong">
            <span className="sr-only">Not run</span>
          </span>
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-sm font-medium text-ink">{scenario.name}</span>
          <Badge>{DIFFICULTY_LABEL[scenario.difficulty]}</Badge>
          {scenario.origin === "seeded_from_failure" && (
            <Badge>{SCENARIO_ORIGIN_LABEL[scenario.origin]}</Badge>
          )}
          {result && (
            <StatusPill
              tone={SCENARIO_RESULT_TONE[result.status]}
              icon={<ResultIcon status={result.status} />}
              className="ml-auto"
            >
              {SCENARIO_RESULT_LABEL[result.status]}
            </StatusPill>
          )}
        </div>

        <p className="mt-1 text-sm text-muted">{scenario.intent}</p>
        <p className="mt-0.5 text-xs text-faint">
          Should: {scenario.expectation}
        </p>

        {result?.finding && (
          <p
            className={cn(
              "mt-2 rounded-control px-2.5 py-2 text-sm",
              result.status === "failed"
                ? "bg-danger-surface text-danger"
                : "bg-warning-surface text-warning",
            )}
          >
            {result.finding}
          </p>
        )}

        {/*
         * Neutral surface, and attributed. The same sentence tinted red would
         * read as a live failure of this draft, which is the thing this row is
         * specifically not claiming.
         */}
        {priorResult?.finding && (
          <p className="mt-2 rounded-control bg-subtle px-2.5 py-2 text-sm text-muted">
            <span className="text-faint">
              When this last ran, against an earlier version:
            </span>{" "}
            {priorResult.finding}
          </p>
        )}
      </div>
    </li>
  );
}

const MARK_SURFACE: Record<ScenarioResultStatus, string> = {
  passed: "bg-success-surface text-success",
  failed: "bg-danger-surface text-danger",
  warning: "bg-warning-surface text-warning",
  skipped: "bg-neutral-surface text-muted",
};

/* ───────────────────────────────────────────────────────────────────── rail */

function Rail({
  employee,
  version,
  scenarios,
  runs,
  suites,
  users,
}: {
  employee: AIEmployee;
  version: EmployeeVersion;
  scenarios: Scenario[];
  runs: SimulationRun[];
  suites: ScenarioSuite[];
  users: User[];
}) {
  const lexicon = useLexicon();
  const cover = useMemo(() => coverage(scenarios), [scenarios]);

  const recent = useMemo(
    () =>
      [...runs]
        .filter((run) => run.employeeId === employee.id)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, 5),
    [runs, employee],
  );

  return (
    <div className="sticky top-14 space-y-7">
      <div>
        <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
          Being rehearsed
        </h2>
        <p className="mt-2.5 text-sm font-medium text-ink">
          {version.persona.name}
          <span className="ml-1.5 font-mono text-2xs text-muted tabular">
            draft v{version.version}
          </span>
        </p>
        <p className="mt-1 text-xs text-muted">
          {employee.liveVersion ? (
            <>
              v{employee.liveVersion.version} is what{" "}
              {lower(lexicon.party.many)} reach today. This draft is not
              answering anything.
            </>
          ) : (
            <>
              Never published — no version of this {lower(lexicon.employee.one)}{" "}
              has answered a real {lower(lexicon.call.one)}.
            </>
          )}
        </p>
      </div>

      <div>
        <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
          What the suites cover
        </h2>
        <dl className="mt-2.5 space-y-2">
          <RailStat
            label={`${suites.length} ${plural(suites.length, "suite", "suites")}`}
            value={`${cover.scenarios} scenarios`}
          />
          {cover.byDifficulty.map((entry) => (
            <RailStat
              key={entry.difficulty}
              label={DIFFICULTY_LABEL[entry.difficulty]}
              value={String(entry.count)}
            />
          ))}
        </dl>

        {/*
         * arch §12 names the simulation–reality gap as a standing risk, and the
         * mitigation it names is seeding suites from calls that actually went
         * wrong. So the number is on screen permanently rather than in a
         * footnote: a green board built entirely from imagined calls proves very
         * little, and the interface should not let it look like proof.
         */}
        <p className="mt-3 text-xs leading-relaxed text-muted">
          <span className="font-medium text-ink tabular">
            {cover.seededFromFailure}
          </span>{" "}
          of these were seeded from {lower(lexicon.call.many)} that really went
          wrong. A clean board is evidence, not a guarantee — a real{" "}
          {lower(lexicon.party.one)} will eventually find the scenario nobody
          wrote.
        </p>
      </div>

      {recent.length > 0 && (
        <div>
          <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
            Recent runs
          </h2>
          <ul className="mt-2.5 space-y-2.5">
            {recent.map((run) => {
              const suite = suites.find((s) => s.id === run.suiteId);
              const who = users.find((u) => u.id === run.triggeredByUserId);
              const against =
                run.employeeVersionId === version.id
                  ? `v${version.version}`
                  : "an earlier version";

              return (
                <li key={run.id} className="text-xs">
                  <p className="text-ink">
                    {suite?.name ?? "A suite"}{" "}
                    <span className="text-faint">against {against}</span>
                  </p>
                  <p className="mt-0.5 text-muted">
                    {run.status === "running" ? (
                      "Running now"
                    ) : (
                      <>
                        {relativeLong(run.finishedAt ?? run.startedAt)}
                        {who && <> · {who.name}</>}
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function RailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-2xs text-ink tabular">{value}</dd>
    </div>
  );
}

/* ─────────────────────────────────────────────────────── empty + edge states */

/**
 * Day one for a real onboarded tenant. Deliberately not seeded with Northgate's
 * suites: scenarios are drawn from calls that actually went wrong, so a dental
 * practice's are worthless to a hotel, and borrowing them would put a stranger's
 * failures under someone else's draft (rule 12).
 */
function NoSuites() {
  const lexicon = useLexicon();
  return (
    <EmptyState
      className="mt-8"
      title="No scenario suites yet"
      description={`A suite is a set of scripted ${lower(lexicon.call.many)} to put a draft through. The ones worth having come from ${lower(lexicon.call.many)} that went wrong in your own workspace, so this fills up once the ${lower(lexicon.employee.one)} has taken real ones and Review has something to seed from.`}
    />
  );
}

function NoDraft({ capabilities }: { capabilities: string[] }) {
  const lexicon = useLexicon();
  const item = navItemById("employees");

  return (
    <EmptyState
      className="mt-8"
      title="Nothing is in draft"
      description={`The Simulator rehearses a change before ${lower(lexicon.party.many)} meet it. With no draft open there is no change to rehearse — every ${lower(lexicon.employee.one)} here is running exactly what was last published.`}
      action={
        item && hasCapability(capabilities, item.capability) ? (
          <Link
            href={item.href}
            className="text-sm font-medium text-ink underline underline-offset-4 hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Open {withArticle(lexicon.employee.one)} to start a draft
          </Link>
        ) : null
      }
    />
  );
}

function NoAccess() {
  const lexicon = useLexicon();
  return (
    <div className="mt-8 max-w-prose rounded-panel border border-line bg-elevated px-5 py-5">
      <p className="flex items-center gap-2 text-md font-medium text-ink">
        <Lock className="size-4 text-faint" aria-hidden />
        This surface belongs to builders
      </p>
      <p className="mt-2 text-sm text-muted">
        Running a suite exercises a draft {lower(lexicon.employee.one)} against
        scripted {lower(lexicon.call.many)}. Your role can see what the{" "}
        {lower(lexicon.employee.many)} actually do on real{" "}
        {lower(lexicon.call.many)}, but not rehearse changes to them.
      </p>
      <Link
        href="/today"
        className="mt-4 inline-block text-sm font-medium text-ink underline underline-offset-4 hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        Back to Today
      </Link>
    </div>
  );
}

function SimulatorSkeleton() {
  return (
    <div className="mt-7 space-y-5" aria-hidden>
      <Skeleton className="h-28 rounded-panel" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-44 rounded-panel" />
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── util */

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Small counts read better as words; past that a numeral is clearer. */
function spellOut(n: number): string {
  return n === 1 ? "one" : n === 2 ? "two" : n === 3 ? "three" : String(n);
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}
