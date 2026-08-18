/**
 * Procedure logic that is not a screen.
 *
 * Two questions run through everything here, and neither can be answered by a
 * procedure on its own:
 *
 *   · *where does this lose calls?* — a completion rate says a procedure is at
 *     87%, which is a number to feel bad about. The step that stopped 41 of
 *     the 79 lost runs is a thing to fix, and it is only visible by walking the
 *     funnel rather than reading the total.
 *
 *   · *can it still run?* — a step naming an action from a connected system is
 *     only as sound as that connection. A procedure that reads perfectly and
 *     depends on an action that has been failing since 08:10 is the most
 *     dangerous document in the product, because nothing about reading it
 *     suggests anything is wrong.
 *
 * The second is why this file takes tools and employees as arguments rather
 * than deriving from a procedure alone. Build surfaces are not independent:
 * what the AI may do, what it can reach and what it has been told to do are
 * three halves of one answer.
 */

import type {
  AIEmployee,
  Procedure,
  ProcedureStep,
  Tool,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Where a procedure loses runs
// ─────────────────────────────────────────────────────────────────────────────

export type StepLoss = {
  step: ProcedureStep;
  /** This step's share of every run the procedure lost, 0–1. */
  shareOfLoss: number;
};

export function totalStopped(procedure: Procedure): number {
  return procedure.steps.reduce((sum, step) => sum + step.stoppedCount, 0);
}

/**
 * Steps that lost runs, worst first.
 *
 * Deliberately expressed as a share of the loss rather than of the runs. "This
 * step stopped 7% of calls" and "this step is more than half of everything you
 * lose" are the same figure, and only the second one tells you what to fix
 * first.
 */
export function stepLosses(procedure: Procedure): StepLoss[] {
  const lost = totalStopped(procedure);
  if (lost === 0) return [];

  return procedure.steps
    .filter((step) => step.stoppedCount > 0)
    .map((step) => ({ step, shareOfLoss: step.stoppedCount / lost }))
    .sort((a, b) => b.shareOfLoss - a.shareOfLoss);
}

/** The single step costing the most, where one clearly is. */
export function weakestStep(procedure: Procedure): StepLoss | null {
  return stepLosses(procedure)[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Whether a procedure can actually run
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Why a step cannot be relied on, in the order that matters: a broken action
 * beats an ungranted one, and an ungranted one beats missing authority,
 * because that is the order in which they have to be fixed.
 */
export type StepBlockerKind =
  | "tool_missing"
  | "tool_unavailable"
  | "tool_unreliable"
  | "tool_not_granted"
  | "not_authorised";

export type StepBlocker = {
  kind: StepBlockerKind;
  /** The action involved, where the reason is about one. */
  tool: Tool | null;
  /** Employees that run this procedure and are stopped by this. */
  employees: AIEmployee[];
};

/** Employees granted this procedure in whichever version is deciding today. */
export function employeesRunning(
  procedureId: string,
  employees: AIEmployee[],
): AIEmployee[] {
  return employees.filter((employee) => {
    const version = employee.liveVersion ?? employee.draftVersion;
    return version?.grants.procedureIds.includes(procedureId) ?? false;
  });
}

/**
 * What stops a step, or null when nothing does.
 *
 * `runners` is passed in rather than recomputed per step so a procedure with
 * twelve steps does not walk the employee list twelve times, and — more to the
 * point — so every step on one screen is judged against the same set.
 */
export function stepBlocker(
  step: ProcedureStep,
  tools: Tool[],
  runners: AIEmployee[],
): StepBlocker | null {
  if (step.toolId) {
    const tool = tools.find((candidate) => candidate.id === step.toolId) ?? null;

    // A step naming an action that no longer exists is a worse problem than a
    // failing one, and a silent one: nothing about the prose gives it away.
    if (!tool) {
      return { kind: "tool_missing", tool: null, employees: runners };
    }

    if (tool.status === "unavailable") {
      return { kind: "tool_unavailable", tool, employees: runners };
    }

    const withoutTool = runners.filter((employee) => {
      const version = employee.liveVersion ?? employee.draftVersion;
      return !(version?.grants.toolIds.includes(tool.id) ?? false);
    });
    if (withoutTool.length > 0) {
      return { kind: "tool_not_granted", tool, employees: withoutTool };
    }

    // Reported last of the tool reasons because it is the only one that is not
    // absolute — the step still completes most of the time, and calling that
    // "blocked" would be the kind of false alarm that gets a list ignored.
    if (tool.status === "degraded") {
      return { kind: "tool_unreliable", tool, employees: runners };
    }
  }

  if (step.capabilityId) {
    const capabilityId = step.capabilityId;
    const unauthorised = runners.filter((employee) => {
      const version = employee.liveVersion ?? employee.draftVersion;
      const grant = version?.authority.find(
        (candidate) => candidate.capabilityId === capabilityId,
      );
      return !grant || grant.hardBlocked || grant.autonomy === "observe";
    });
    if (unauthorised.length > 0) {
      return { kind: "not_authorised", tool: null, employees: unauthorised };
    }
  }

  return null;
}

/** Every blocked step in a procedure, in the order they are written. */
export function blockedSteps(
  procedure: Procedure,
  tools: Tool[],
  runners: AIEmployee[],
): { step: ProcedureStep; blocker: StepBlocker }[] {
  return procedure.steps
    .map((step) => ({ step, blocker: stepBlocker(step, tools, runners) }))
    .filter(
      (entry): entry is { step: ProcedureStep; blocker: StepBlocker } =>
        entry.blocker !== null,
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ordering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Drafts last, then by what the business is actually losing.
 *
 * Run count alone would put a healthy 612-run procedure above a 79%-complete
 * one running 88 times, when the second is the one leaking. Lost runs is the
 * product of the two, and it is the number a manager would rank by if they
 * worked it out by hand.
 */
export function rankProcedures(procedures: Procedure[]): Procedure[] {
  return [...procedures].sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return totalStopped(b) - totalStopped(a);
  });
}

/**
 * The spine: the steps a run passes through when nothing diverts it.
 *
 * The funnel is drawn from these and not from every step, because a side path
 * plotted in sequence lies about the shape. The urgent hand-off in the booking
 * procedure is reached by 14 runs out of 612 — plotted as the sixth bar it
 * reads as a collapse at the end, when it is a branch working exactly as
 * written.
 */
export function mainPath(procedure: Procedure): ProcedureStep[] {
  return procedure.steps.filter((step) => !step.offMainPath);
}

/** The step a run reached last, given how far it got. */
export function stepIndex(procedure: Procedure, stepId: string): number {
  return procedure.steps.findIndex((step) => step.id === stepId);
}
