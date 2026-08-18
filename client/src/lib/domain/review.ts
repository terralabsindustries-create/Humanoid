/**
 * Review logic that is not a screen.
 *
 * The queue and the issue detail both need to agree on what "most important"
 * means and on where a fix would actually be applied. Those two answers live
 * here rather than in either screen, because a queue ranked one way and a
 * briefing ranked another is the fastest way to make an operator distrust both.
 */

import type {
  IssueCause,
  IssueSeverity,
  ProposedFixKind,
  ReviewIssue,
} from "./types";

const SEVERITY_ORDER: Record<IssueSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Severity first, then blast radius, then recency.
 *
 * Blast radius alone would bury a critical failure affecting twelve calls
 * under a medium one affecting two hundred — and severity alone would rank a
 * high-severity item affecting one call above the same severity affecting
 * forty. The tie-break on recency keeps a stale item from sitting above one
 * that is still happening.
 */
export function rankIssues(issues: ReviewIssue[]): ReviewIssue[] {
  return [...issues].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const byRadius = b.affectedConversationCount - a.affectedConversationCount;
    if (byRadius !== 0) return byRadius;
    return b.lastSeenAt.localeCompare(a.lastSeenAt);
  });
}

export type CauseFacet = {
  cause: IssueCause;
  count: number;
  /** Conversations affected by every issue with this cause. */
  affected: number;
};

/** Causes present in a set of issues, largest blast radius first. */
export function causeFacets(issues: ReviewIssue[]): CauseFacet[] {
  const byCause = new Map<IssueCause, CauseFacet>();

  for (const issue of issues) {
    const facet = byCause.get(issue.cause) ?? {
      cause: issue.cause,
      count: 0,
      affected: 0,
    };
    facet.count += 1;
    facet.affected += issue.affectedConversationCount;
    byCause.set(issue.cause, facet);
  }

  return [...byCause.values()].sort((a, b) => b.affected - a.affected);
}

export function totalAffected(issues: ReviewIssue[]): number {
  return issues.reduce((sum, issue) => sum + issue.affectedConversationCount, 0);
}

/**
 * Where a fix is applied, and what a person needs to be allowed to apply it.
 *
 * Review is where you judge; Build is where the change is made. Naming the
 * destination by nav item id rather than by href or label keeps the link and
 * its wording resolving through navigation and the lexicon, so a workspace
 * that calls procedures "protocols" says protocols here too.
 */
export type FixDestination = {
  navItemId: string;
  /** Capability required to make the change, per the role presets. */
  capability: string;
};

export const FIX_DESTINATION: Record<ProposedFixKind, FixDestination> = {
  add_knowledge: { navItemId: "knowledge", capability: "knowledge.edit" },
  edit_knowledge: { navItemId: "knowledge", capability: "knowledge.edit" },
  resolve_conflict: { navItemId: "knowledge", capability: "knowledge.edit" },
  edit_procedure: { navItemId: "procedures", capability: "procedure.edit" },
  adjust_autonomy: { navItemId: "employees", capability: "employee.edit" },
  reconnect_tool: { navItemId: "tools", capability: "tool.configure" },
};
