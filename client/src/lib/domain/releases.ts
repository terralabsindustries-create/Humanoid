/**
 * Release logic that is not a screen.
 *
 * Two questions decide everything on the Releases surface, and neither is a
 * stored field: *which version is actually live right now*, and *did the
 * simulation clear this one to publish*. Both are derived here rather than in
 * the screen, because a header that says v14 is live and a rollback control
 * that acts on v13 is the kind of disagreement that ends with someone
 * publishing the wrong thing to a phone line.
 */

import type {
  Release,
  ReleaseChange,
  Scenario,
  ScenarioResult,
  SimulationRun,
} from "./types";
import type { Lexicon } from "@/lib/lexicon";

/**
 * Drafts, oldest employee first is meaningless — order by how long they have
 * been waiting is not knowable either, since a draft carries no timestamp. So
 * they keep fixture order, which is the order they were created in.
 */
export function pendingReleases(releases: Release[]): Release[] {
  return releases.filter((release) => release.state === "draft");
}

/**
 * Everything that has actually been published, newest first — including the
 * ones that were rolled back, because a release that had to be undone is the
 * most useful entry in the list, not one to hide.
 *
 * Ordered by publish time rather than version: versions only compare within
 * one employee, and this list spans the roster.
 */
export function releaseHistory(releases: Release[]): Release[] {
  return releases
    .filter((release) => release.state !== "draft")
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

/**
 * The version answering the phone for one employee right now.
 *
 * Derived rather than flagged: "published" is a fact about a release, but
 * "live" is a fact about the set — the highest published version that has not
 * since been rolled back. A rolled-back release is still part of the history
 * and still `publishedAt`, so a stored `isLive` boolean would have to be kept
 * in step with every rollback, and one missed update would put the wrong
 * version's name under the word Live.
 */
export function liveRelease(
  releases: Release[],
  employeeId: string,
): Release | null {
  return (
    releases
      .filter((r) => r.employeeId === employeeId && r.state === "published")
      .sort((a, b) => b.version - a.version)[0] ?? null
  );
}

/** What a rollback would put back — the published version below the live one. */
export function rollbackTarget(
  releases: Release[],
  release: Release,
): Release | null {
  return (
    releases
      .filter(
        (r) =>
          r.employeeId === release.employeeId &&
          r.state === "published" &&
          r.version < release.version,
      )
      .sort((a, b) => b.version - a.version)[0] ?? null
  );
}

/**
 * Only the live release can be rolled back. Undoing something that is not in
 * force is not a rollback — it would either do nothing or silently republish
 * an older version, and neither is what the word promises.
 */
export function canRollBack(releases: Release[], release: Release): boolean {
  return liveRelease(releases, release.employeeId)?.id === release.id;
}

/** Whether anything in a release widens what the AI may do without asking. */
export function raisesAuthority(changes: ReleaseChange[]): boolean {
  return changes.some((change) => change.raisesAuthority);
}

/**
 * The area a change touched. Every value here is interface vocabulary except
 * one: a procedure is called a Protocol in a clinic and a Playbook in a hotel,
 * so that word comes from the lexicon and the rest do not.
 */
export function changeAreaLabel(
  area: ReleaseChange["area"],
  lexicon: Lexicon,
): string {
  switch (area) {
    case "persona":
      return "Persona";
    case "knowledge":
      return "Knowledge";
    case "procedure":
      return lexicon.procedure.one;
    case "tool":
      return "Tool";
    case "authority":
      return "Authority";
    case "policy":
      return "Policy";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The simulation gate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A scenario that did not pass cleanly, named rather than scored.
 *
 * `id` is the scenario id, which is what an acknowledgement is recorded
 * against — a publisher accepts *this specific finding*, not "two warnings".
 */
export type GateFinding = {
  id: string;
  scenarioName: string;
  status: ScenarioResult["status"];
  finding: string;
};

export type ReleaseGate = {
  /** Every run that exercised this version. */
  runs: SimulationRun[];
  total: number;
  passed: number;
  warnings: number;
  failures: number;
  /** Warnings and failures, worst first. Skipped results are not findings. */
  findings: GateFinding[];
  /** When the version was last exercised. */
  lastRunAt: string | null;
};

const FINDING_ORDER: Record<ScenarioResult["status"], number> = {
  failed: 0,
  warning: 1,
  passed: 2,
  skipped: 3,
};

/**
 * Every simulation run against one version, collapsed into one verdict.
 *
 * Aggregating across runs rather than trusting a single `simulationRunId` is
 * deliberate: suites are run separately — core, then safety, then the hard
 * cases — and a gate that reported only the most recent one would show three
 * green passes from the safety suite while a failure in the hard suite sat
 * unmentioned. The question being answered is "has everything we test been run
 * against this version, and what did it find", which no single run can answer.
 */
export function gateForVersion(
  versionId: string | null,
  runs: SimulationRun[],
  scenarios: Scenario[],
): ReleaseGate | null {
  if (!versionId) return null;

  const relevant = runs.filter(
    (run) => run.employeeVersionId === versionId && run.status === "complete",
  );
  if (relevant.length === 0) return null;

  const scenarioName = (id: string) =>
    scenarios.find((scenario) => scenario.id === id)?.name ?? id;

  const results = relevant.flatMap((run) => run.results);
  const findings = results
    .filter(
      (result) => result.status === "failed" || result.status === "warning",
    )
    .map((result) => ({
      id: result.scenarioId,
      scenarioName: scenarioName(result.scenarioId),
      status: result.status,
      // A finding with no text would be a status with nothing behind it.
      finding: result.finding ?? "No detail was recorded for this result.",
    }))
    .sort((a, b) => FINDING_ORDER[a.status] - FINDING_ORDER[b.status]);

  return {
    runs: relevant,
    total: results.length,
    passed: results.filter((r) => r.status === "passed").length,
    warnings: results.filter((r) => r.status === "warning").length,
    failures: results.filter((r) => r.status === "failed").length,
    findings,
    lastRunAt:
      relevant
        .map((run) => run.finishedAt ?? run.startedAt)
        .sort((a, b) => b.localeCompare(a))[0] ?? null,
  };
}

/** The gate as it stood for an already-published release. */
export function gateForRun(
  runId: string | null,
  runs: SimulationRun[],
  scenarios: Scenario[],
): ReleaseGate | null {
  const run = runs.find((candidate) => candidate.id === runId);
  if (!run) return null;
  return gateForVersion(run.employeeVersionId, [run], scenarios);
}

/**
 * What stops a publish, said as a reason rather than a boolean.
 *
 * Never simulated is a harder stop than simulated-and-flagged: a flagged
 * finding is a judgement a person can make and record, while an unsimulated
 * version is an unanswered question, and there is nothing to acknowledge
 * because nothing has been found out yet.
 */
export type PublishBlocker =
  | { kind: "not_simulated" }
  | { kind: "findings"; findings: GateFinding[] }
  | { kind: "no_changes" };

export function publishBlockers(
  release: Release,
  gate: ReleaseGate | null,
): PublishBlocker[] {
  const blockers: PublishBlocker[] = [];
  if (release.changes.length === 0) blockers.push({ kind: "no_changes" });
  if (!gate) blockers.push({ kind: "not_simulated" });
  else if (gate.findings.length > 0) {
    blockers.push({ kind: "findings", findings: gate.findings });
  }
  return blockers;
}
