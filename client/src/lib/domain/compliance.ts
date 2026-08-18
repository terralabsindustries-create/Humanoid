/**
 * Compliance logic that is not a screen.
 *
 * The organising claim of the Govern → Compliance surface is that these are
 * gates rather than settings (arch §2.5, §13.5): an unmet one blocks a publish
 * instead of sitting in a preferences pane waiting to be noticed. That claim
 * only holds if "is this workspace clear to publish" has exactly one answer,
 * computed in one place — the moment the readiness banner and the release
 * screen each derive it their own way, one of them starts lying.
 *
 * So the verdict lives here, and every surface that needs it asks. Nothing in
 * this file knows about React, and nothing in it knows about healthcare: a gate
 * is a gate whether it came from a HIPAA pack or a hospitality one.
 */

import type { ComplianceGate, ComplianceGateStatus, RetentionPolicy } from "./types";

/**
 * Needs-action first, then met, then not-applicable.
 *
 * Not-applicable sinks to the bottom rather than being dropped: "was recording
 * law considered here?" is a question a regulator asks, and an obligation that
 * was assessed and ruled out is a different answer from one nobody looked at.
 */
const STATUS_ORDER: Record<ComplianceGateStatus, number> = {
  action_needed: 0,
  met: 1,
  not_applicable: 2,
};

/**
 * Within a status, least recently reviewed first.
 *
 * Two gates both needing action are not equally urgent — the one nobody has
 * looked at for three weeks is the one drifting. A gate that has never been
 * reviewed sorts above every gate that has, because "no review on record" is a
 * worse position than a stale one, not an unknown to be shuffled to the end.
 */
export function rankGates(gates: ComplianceGate[]): ComplianceGate[] {
  return [...gates].sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    if (a.lastReviewedAt === null && b.lastReviewedAt === null) {
      return a.name.localeCompare(b.name);
    }
    if (a.lastReviewedAt === null) return -1;
    if (b.lastReviewedAt === null) return 1;
    return a.lastReviewedAt.localeCompare(b.lastReviewedAt);
  });
}

export type GateSummary = {
  total: number;
  met: number;
  actionNeeded: number;
  notApplicable: number;
  /**
   * Whether an unmet gate is standing between this workspace and a publish.
   * The one question this screen exists to answer.
   */
  blocked: boolean;
  /** Gates that count toward the verdict — not-applicable ones do not. */
  inScope: number;
};

export function summariseGates(gates: ComplianceGate[]): GateSummary {
  const met = gates.filter((gate) => gate.status === "met").length;
  const actionNeeded = gates.filter(
    (gate) => gate.status === "action_needed",
  ).length;
  const notApplicable = gates.filter(
    (gate) => gate.status === "not_applicable",
  ).length;

  return {
    total: gates.length,
    met,
    actionNeeded,
    notApplicable,
    blocked: actionNeeded > 0,
    inScope: met + actionNeeded,
  };
}

/**
 * The oldest review on record among gates that still count.
 *
 * Not-applicable gates are excluded deliberately: an obligation ruled out two
 * years ago is not evidence of neglect, and letting it set this figure would
 * make the review-currency line permanently red for no reason anyone can act on.
 * Returns null when nothing in scope has ever been reviewed.
 */
export function oldestReview(gates: ComplianceGate[]): string | null {
  const reviewed = gates
    .filter((gate) => gate.status !== "not_applicable")
    .map((gate) => gate.lastReviewedAt)
    .filter((at): at is string => at !== null);

  if (reviewed.length === 0) return null;
  return reviewed.reduce((oldest, at) => (at < oldest ? at : oldest));
}

/** Gates a given person is answerable for, for the owner breakdown. */
export function gatesByOwner(
  gates: ComplianceGate[],
): { ownerUserId: string | null; total: number; actionNeeded: number }[] {
  const byOwner = new Map<
    string | null,
    { ownerUserId: string | null; total: number; actionNeeded: number }
  >();

  for (const gate of gates) {
    const entry = byOwner.get(gate.ownerUserId) ?? {
      ownerUserId: gate.ownerUserId,
      total: 0,
      actionNeeded: 0,
    };
    entry.total += 1;
    if (gate.status === "action_needed") entry.actionNeeded += 1;
    byOwner.set(gate.ownerUserId, entry);
  }

  // Whoever has the most outstanding work first — this list is read to find
  // out who to chase, not to enumerate the team.
  return [...byOwner.values()].sort(
    (a, b) => b.actionNeeded - a.actionNeeded || b.total - a.total,
  );
}

/**
 * A retention period in the words a person would use.
 *
 * Whole years and months get named as such; everything else stays in days
 * rather than being rounded into a figure that no longer matches the policy.
 * "7 years" is the same fact as 2,555 days and far easier to check against a
 * regulation; "2.4 months" is neither.
 */
export function retentionLabel(days: number): string {
  if (days === 0) return "Not retained";
  if (days % 365 === 0) {
    const years = days / 365;
    return years === 1 ? "1 year" : `${years} years`;
  }
  if (days % 30 === 0 && days >= 60) {
    return `${days / 30} months`;
  }
  return days === 1 ? "1 day" : `${days} days`;
}

/** The policy a gate is arguing about, so the gate can quote the live figure. */
export function retentionFor(
  gate: ComplianceGate,
  policies: RetentionPolicy[],
): RetentionPolicy | null {
  if (!gate.retentionPolicyId) return null;
  return policies.find((policy) => policy.id === gate.retentionPolicyId) ?? null;
}
