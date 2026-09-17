import { http } from "./client";

/** Shapes returned by the backend's review module, one-to-one with the API. */
export type ApiReviewIssue = {
  id: string;
  cause: string;
  title: string;
  detail: string;
  severity: string;
  status: string;
  affectedConversationCount: number;
  evidenceConversationIds: string[];
  employeeId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  assignedToUserId: string | null;
};

export type ReviewIssueStatus = "open" | "in_progress" | "resolved" | "dismissed";

export function listReviewIssues(workspaceId: string) {
  return http.get<ApiReviewIssue[]>(`/workspaces/${workspaceId}/review/issues`);
}

export function getReviewIssue(workspaceId: string, issueId: string) {
  return http.get<ApiReviewIssue>(`/workspaces/${workspaceId}/review/issues/${issueId}`);
}

export function updateReviewIssue(
  workspaceId: string,
  issueId: string,
  body: { status?: ReviewIssueStatus; assignedToUserId?: string | null },
) {
  return http.patch<ApiReviewIssue>(
    `/workspaces/${workspaceId}/review/issues/${issueId}`,
    body,
  );
}
