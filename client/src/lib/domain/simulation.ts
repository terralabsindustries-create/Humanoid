/**
 * Simulation logic that is not a screen.
 *
 * The Simulator and Releases have to agree on one thing above all else:
 * whether a draft has been rehearsed, and what the rehearsal found.
 * `gateForVersion` in `./releases` is that shared answer, and it is
 * deliberately not reimplemented here — a publish gate that says "cleared" on
 * one screen while the Simulator says "one failure" on the other is how an
 * operator learns to trust neither.
 *
 * What this file adds is the question the Simulator asks and Releases does
 * not. The gate aggregates every run against a version into one verdict; the
 * Simulator has to show *which suites produced it*, and — the part that
 * actually decides what a person does next — which suites have said nothing
 * about this version at all, because they have not been run against it.
 */

import type {
  Scenario,
  ScenarioResult,
  ScenarioResultStatus,
  ScenarioSuite,
  SimulationRun,
} from "./types";

/**
 * Worst first. A set of results is only as good as its worst member, so this
 * ordering is what decides a suite's headline — four passes and one failure is
 * a failure, not "mostly fine".
 */
const STATUS_ORDER: Record<ScenarioResultStatus, number> = {
  failed: 0,
  warning: 1,
  skipped: 2,
  passed: 3,
};

export type ResultTally = {
  passed: number;
  warning: number;
  failed: number;
  skipped: number;
  total: number;
};

export function tallyResults(results: ScenarioResult[]): ResultTally {
  return {
    passed: results.filter((r) => r.status === "passed").length,
    warning: results.filter((r) => r.status === "warning").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    total: results.length,
  };
}

/** The status a set of results reports as a whole. Null for an empty set. */
export function worstStatus(
  results: ScenarioResult[],
): ScenarioResultStatus | null {
  return (
    [...results].sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
    )[0]?.status ?? null
  );
}

/**
 * Where one suite stands against one version of one employee.
 *
 * `stale` is the state that matters and the one a simpler model would lose. A
 * suite that passed cleanly last week against v14 is *not* evidence about v15,
 * and showing it as a green tick beside the draft would be the single most
 * dangerous thing this screen could do: it would tell someone their untested
 * change had been tested. So a result from another version keeps its findings
 * but loses its authority, and says so.
 */
export type SuiteStandingState =
  | "running"
  | "never_run"
  | "stale"
  | "passed"
  | "warning"
  | "failed";

export type SuiteStanding = {
  suite: ScenarioSuite;
  state: SuiteStandingState;
  /**
   * The run this standing is drawn from: the newest complete run against this
   * version, or — when there is none — the newest run against any version, so
   * the screen can say what happened last time rather than nothing at all.
   */
  run: SimulationRun | null;
  /** True when `run` exercised a different version. History, not evidence. */
  stale: boolean;
  tally: ResultTally;
};

/** Newest first, by start time. */
function newestFirst(runs: SimulationRun[]): SimulationRun[] {
  return [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function suiteStanding(
  suite: ScenarioSuite,
  runs: SimulationRun[],
  employeeId: string,
  versionId: string | null,
): SuiteStanding {
  const mine = newestFirst(
    runs.filter((run) => run.suiteId === suite.id && run.employeeId === employeeId),
  );

  const running = mine.find((run) => run.status === "running");
  if (running) {
    return {
      suite,
      state: "running",
      run: running,
      stale: false,
      tally: tallyResults(running.results),
    };
  }

  const complete = mine.filter((run) => run.status === "complete");
  const current = versionId
    ? complete.find((run) => run.employeeVersionId === versionId)
    : undefined;

  if (current) {
    const worst = worstStatus(current.results);
    return {
      suite,
      state: worst === null ? "never_run" : worst === "skipped" ? "passed" : worst,
      run: current,
      stale: false,
      tally: tallyResults(current.results),
    };
  }

  const previous = complete[0];
  if (previous) {
    return {
      suite,
      state: "stale",
      run: previous,
      stale: true,
      tally: tallyResults(previous.results),
    };
  }

  return {
    suite,
    state: "never_run",
    run: null,
    stale: false,
    tally: tallyResults([]),
  };
}

/**
 * Every suite's standing, in the order the suites were defined.
 *
 * Deliberately not sorted by severity, unlike the Review queue. Review is a
 * queue and ranking is its job; this is a checklist someone works down and
 * re-runs as they go, and a list that reshuffles itself under the cursor after
 * every run makes that impossible to follow.
 */
export function suiteStandings(
  suites: ScenarioSuite[],
  runs: SimulationRun[],
  employeeId: string,
  versionId: string | null,
): SuiteStanding[] {
  return suites.map((suite) => suiteStanding(suite, runs, employeeId, versionId));
}

/** Suites with nothing current to say about this version — the work left. */
export function unrunSuites(standings: SuiteStanding[]): SuiteStanding[] {
  return standings.filter(
    (standing) => standing.state === "never_run" || standing.state === "stale",
  );
}

/** The most recent result recorded for each scenario within a run. */
export function resultsByScenario(
  run: SimulationRun | null,
): Map<string, ScenarioResult> {
  const map = new Map<string, ScenarioResult>();
  for (const result of run?.results ?? []) map.set(result.scenarioId, result);
  return map;
}

/**
 * What the suites actually cover.
 *
 * `seededFromFailure` is the honest number, and the reason this exists at all:
 * arch §12 names the simulation–reality gap as a top risk, and its mitigation
 * is seeding suites from calls that genuinely went wrong rather than from
 * imagined ones. A green suite of invented scenarios proves very little, and
 * the interface should make the difference visible rather than reporting one
 * pass count for both.
 */
export type Coverage = {
  scenarios: number;
  seededFromFailure: number;
  byDifficulty: { difficulty: Scenario["difficulty"]; count: number }[];
};

const DIFFICULTY_ORDER: Scenario["difficulty"][] = [
  "routine",
  "awkward",
  "adversarial",
];

export function coverage(scenarios: Scenario[]): Coverage {
  return {
    scenarios: scenarios.length,
    seededFromFailure: scenarios.filter(
      (scenario) => scenario.origin === "seeded_from_failure",
    ).length,
    byDifficulty: DIFFICULTY_ORDER.map((difficulty) => ({
      difficulty,
      count: scenarios.filter((s) => s.difficulty === difficulty).length,
    })).filter((entry) => entry.count > 0),
  };
}

/** Simulated call time across a set of results — "2:11 of calls rehearsed". */
export function simulatedSeconds(results: ScenarioResult[]): number {
  return results.reduce((total, result) => total + result.durationSeconds, 0);
}
