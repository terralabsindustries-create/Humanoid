/**
 * Performance derivation.
 *
 * Everything the performance surface shows is computed from one series of
 * `PerformancePoint`s and the equivalent series for the preceding period. That
 * matters more than it sounds: the moment a range or a site filter can produce
 * a headline number and a breakdown that disagree, the whole screen stops being
 * evidence and starts being decoration.
 *
 * No React here. The screen renders these results; it does not do arithmetic.
 */

import type {
  BlockerType,
  IssueCause,
  PerformancePoint,
  ReviewIssue,
} from "./types";

// ─────────────────────────────────────────────────────────────────── outcomes

export type OutcomeKey = "resolved" | "escalated" | "abandoned" | "failed";

/**
 * Fixed order, best to worst, used by every outcome display on the surface.
 * Never sorted by size: a mix that reorders itself between two ranges can't be
 * compared at a glance, which is the only thing a mix is for.
 */
export const OUTCOME_ORDER: readonly OutcomeKey[] = [
  "resolved",
  "escalated",
  "abandoned",
  "failed",
] as const;

export type OutcomeTotals = Record<OutcomeKey, number> & { calls: number };

export function totalOutcomes(points: PerformancePoint[]): OutcomeTotals {
  return points.reduce<OutcomeTotals>(
    (acc, p) => ({
      calls: acc.calls + p.calls,
      resolved: acc.resolved + p.resolved,
      escalated: acc.escalated + p.escalated,
      abandoned: acc.abandoned + p.abandoned,
      failed: acc.failed + p.failed,
    }),
    { calls: 0, resolved: 0, escalated: 0, abandoned: 0, failed: 0 },
  );
}

/** Safe share. An empty period is 0, never NaN and never a divide-by-zero. */
export function share(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

// ───────────────────────────────────────────────────────────────────── effort

/**
 * Effort, per arch §3.8 — how hard the caller had to work. Deliberately not
 * sentiment: this product does not guess at feelings, it counts the things that
 * make a call laborious.
 */
export type Effort = {
  /** Seconds. */
  medianHandleTimeSeconds: number;
  clarificationTurnsPerCall: number;
  repeatRate: number;
  /** Share of calls that ended up with a person, for any reason. */
  transferRate: number;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export function effortOver(points: PerformancePoint[]): Effort {
  const totals = totalOutcomes(points);
  const clarifications = points.reduce((n, p) => n + p.clarificationTurns, 0);
  const repeats = points.reduce((n, p) => n + p.repeats, 0);
  return {
    // The middle day's median, not a mean of medians: a mean would let one
    // freak Tuesday drag a fortnight's typical call length around.
    medianHandleTimeSeconds: median(points.map((p) => p.medianHandleTime)),
    clarificationTurnsPerCall: share(clarifications, totals.calls),
    repeatRate: share(repeats, totals.calls),
    // An escalation is a transfer to a person by definition, so this is the
    // same count seen from the caller's side rather than a second measure.
    transferRate: share(totals.escalated, totals.calls),
  };
}

// ─────────────────────────────────────────────────────────────────── movement

/**
 * Which way is good. Stated per metric because it is not guessable — a falling
 * resolution rate and a falling handle time are opposite news.
 */
export type MetricDirection = "higher_is_better" | "lower_is_better";

export type Movement = {
  /** Signed difference, in the metric's own units. */
  delta: number;
  /** Signed fraction of the previous value, or null when there is no baseline. */
  relative: number | null;
  /** "flat" absorbs movement too small to act on, rather than crying wolf. */
  direction: "better" | "worse" | "flat";
};

/**
 * Compare a period against the one before it.
 *
 * `deadBand` is in the metric's units and defaults to nothing, because the
 * right threshold for "that's just noise" depends entirely on the metric: half
 * a percentage point of resolution rate is noise, half a second of handle time
 * is not.
 */
export function movement(
  current: number,
  previous: number,
  metricDirection: MetricDirection,
  deadBand = 0,
): Movement {
  const delta = current - previous;
  const better = metricDirection === "higher_is_better" ? delta > 0 : delta < 0;
  return {
    delta,
    relative: previous !== 0 ? delta / previous : null,
    direction:
      Math.abs(delta) <= deadBand ? "flat" : better ? "better" : "worse",
  };
}

// ──────────────────────────────────────────────────────────────────── remedies

/**
 * What to do about an escalation reason.
 *
 * This is the join that makes the surface actionable rather than informational.
 * A blocker count on its own invites the wrong conclusion — that every
 * escalation is a defect to be driven to zero. Some are the product working
 * exactly as designed: a caller who asks for a person should get one, and a
 * rule that says "a human signs this off" is a rule someone chose on purpose.
 * Separating the two is the difference between a number that directs attention
 * and a number that just applies pressure.
 */
export type BlockerRemedy = {
  kind: "fixable" | "by_design";
  /** Imperative, and specific enough to start on. */
  remedy: string;
  /** Review-queue causes that would reduce this blocker if resolved. */
  causes: IssueCause[];
};

export const BLOCKER_REMEDY: Record<BlockerType, BlockerRemedy> = {
  tool_failed: {
    kind: "fixable",
    remedy: "Fix the connection that timed out, or give the AI a fallback.",
    causes: ["tool_failure"],
  },
  conflicting_sources: {
    kind: "fixable",
    remedy: "Resolve the disagreement so one answer is the approved one.",
    causes: ["conflicting_knowledge", "stale_knowledge"],
  },
  identity_unverified: {
    kind: "fixable",
    remedy: "Widen what counts as proof, or add a step that can check it.",
    causes: ["procedure_gap", "policy_ambiguity"],
  },
  ambiguous_intent: {
    kind: "fixable",
    remedy: "Teach the phrasings callers actually use for this.",
    causes: ["missing_knowledge", "unclear_scope", "transcription_failure"],
  },
  out_of_scope: {
    kind: "fixable",
    remedy: "Bring this in scope, or hand it over sooner than the AI does now.",
    causes: ["unclear_scope", "missing_knowledge", "procedure_gap"],
  },
  policy_requires_human: {
    kind: "by_design",
    remedy: "A rule you set sends these to a person. Change the rule to change the number.",
    causes: ["autonomy_too_low", "policy_ambiguity"],
  },
  customer_requested_human: {
    kind: "by_design",
    remedy: "The caller asked. Honouring that is the product working.",
    causes: [],
  },
  emotional_distress: {
    kind: "by_design",
    remedy: "Distress routes to a person on purpose. Leave it.",
    causes: [],
  },
};

/**
 * Open review-queue issues that would reduce this blocker, worst blast radius
 * first — the specific change to make, not just the category of change.
 */
export function issuesForBlocker(
  blocker: BlockerType,
  issues: ReviewIssue[],
): ReviewIssue[] {
  const causes = BLOCKER_REMEDY[blocker].causes;
  return issues
    .filter(
      (issue) =>
        (issue.status === "open" || issue.status === "in_progress") &&
        causes.includes(issue.cause),
    )
    .sort((a, b) => b.affectedConversationCount - a.affectedConversationCount);
}

/**
 * The single change with the best case for being made next: the fixable blocker
 * costing the most calls that also has a named issue behind it. Returns null
 * when nothing qualifies, which is a real answer — it means the escalations
 * left are the ones that are supposed to happen.
 */
export function bestNextFix(
  breakdown: { blocker: BlockerType; count: number }[],
  issues: ReviewIssue[],
): { blocker: BlockerType; count: number; issue: ReviewIssue } | null {
  for (const entry of [...breakdown].sort((a, b) => b.count - a.count)) {
    if (BLOCKER_REMEDY[entry.blocker].kind !== "fixable") continue;
    const [issue] = issuesForBlocker(entry.blocker, issues);
    if (issue) return { ...entry, issue };
  }
  return null;
}

// ────────────────────────────────────────────────────────────────── formatting

/** "2m 48s" — durations on this surface are spoken, not decimalised. */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  if (minutes === 0) return `${rest}s`;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

/** Whole percents. No decimal place survives contact with a real reader. */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Signed percentage points, for a delta against the previous period. */
export function formatPercentagePoints(delta: number): string {
  const points = Math.round(delta * 100);
  return `${points > 0 ? "+" : points < 0 ? "−" : ""}${Math.abs(points)} pts`;
}
