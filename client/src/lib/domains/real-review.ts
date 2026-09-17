import type {
  IssueCause,
  IssueSeverity,
  IssueStatus,
  ReviewIssue,
} from "@/lib/domain/types";
import * as api from "@/lib/services/http/review";
import { HttpError } from "@/lib/services/http/client";

/**
 * Real review causes — raised from real calls — mapped onto the same
 * `ReviewIssue` the Northgate fixtures use.
 *
 * The third of these bridges, after conversations and records, and the same
 * rule applies: what the backend cannot produce comes back at its honest empty
 * value rather than borrowed from the demo tenant.
 *
 * The one that matters here is `proposedFix`. Northgate's issues each carry a
 * drafted before/after, because a fixture can. A real cause cannot: proposing
 * the words an AI employee should say instead means knowing the business's
 * actual answer, and nothing in this system knows it — there is no knowledge
 * base to draft against yet. Returning null is what makes the issue detail
 * render "someone has to decide what the AI should say or do instead", which
 * is exactly true. Inventing a fix would be worse than useless: it would be a
 * plausible answer to a customer's question, written by nobody.
 */

const CAUSES: IssueCause[] = [
  "missing_knowledge",
  "conflicting_knowledge",
  "stale_knowledge",
  "procedure_gap",
  "procedure_error",
  "tool_failure",
  "policy_ambiguity",
  "transcription_failure",
  "unclear_scope",
  "autonomy_too_low",
  "autonomy_too_high",
];

const SEVERITIES: IssueSeverity[] = ["critical", "high", "medium", "low"];
const STATUSES: IssueStatus[] = ["open", "in_progress", "resolved", "dismissed"];

function oneOf<T extends string>(values: T[], raw: string, fallback: T): T {
  return (values as string[]).includes(raw) ? (raw as T) : fallback;
}

function mapIssue(issue: api.ApiReviewIssue): ReviewIssue {
  return {
    id: issue.id,
    cause: oneOf(CAUSES, issue.cause, "missing_knowledge"),
    title: issue.title,
    detail: issue.detail,
    severity: oneOf(SEVERITIES, issue.severity, "medium"),
    status: oneOf(STATUSES, issue.status, "open"),
    affectedConversationCount: issue.affectedConversationCount,
    evidenceConversationIds: issue.evidenceConversationIds,
    employeeId: issue.employeeId ?? "",
    firstSeenAt: issue.firstSeenAt,
    lastSeenAt: issue.lastSeenAt,
    proposedFix: null,
    assignedToUserId: issue.assignedToUserId,
  };
}

export async function listRealReviewIssues(workspaceId: string): Promise<ReviewIssue[]> {
  const raw = await api.listReviewIssues(workspaceId);
  return raw.map(mapIssue);
}

export async function getRealReviewIssue(
  workspaceId: string,
  issueId: string,
): Promise<ReviewIssue | null> {
  try {
    return mapIssue(await api.getReviewIssue(workspaceId, issueId));
  } catch (error) {
    // A link to a cause that no longer exists is a normal thing to follow —
    // the issue detail has copy for exactly this — so it must not surface as
    // a failed request.
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

export async function updateRealReviewIssueStatus(
  workspaceId: string,
  issueId: string,
  status: IssueStatus,
): Promise<ReviewIssue> {
  return mapIssue(await api.updateReviewIssue(workspaceId, issueId, { status }));
}
