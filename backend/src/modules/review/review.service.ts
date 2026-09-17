import { prisma } from "@/db/client.js";

/**
 * Review: the causes behind calls that did not go cleanly.
 *
 * The organising decision, and the reason this is not a `call_failures` log:
 * a row here is a **cause**, not an incident. Forty-three callers hitting the
 * same unanswerable question is one row affecting forty-three calls, not
 * forty-three rows. `causeKey` is that identity, and the unique constraint on
 * it is what makes the second occurrence join the first.
 *
 * Everything in here is raised from something that actually happened on a
 * real call — either the employee itself said it hit a wall (`flag_unresolved`
 * in `telephony/escalation-tool.ts`) or the call ended in a way the pipeline
 * records. Nothing is inferred from a model's opinion of a transcript, and
 * there is deliberately no detector for the causes this system cannot yet
 * observe: `conflicting_knowledge` and `stale_knowledge` need a knowledge base
 * to be in conflict, `procedure_gap` and `procedure_error` need procedures,
 * and the two autonomy causes need an authority matrix a real tenant can be
 * given. None of those exist, so none of them are ever raised — an empty
 * facet is the true answer, and a fabricated one would be indistinguishable
 * from a real finding.
 */

/** The subset of the frontend's `IssueCause` this system can honestly detect. */
export type ReviewCause =
  | "missing_knowledge"
  | "policy_ambiguity"
  | "unclear_scope"
  | "tool_failure"
  | "transcription_failure";

const CAUSES: ReviewCause[] = [
  "missing_knowledge",
  "policy_ambiguity",
  "unclear_scope",
  "tool_failure",
  "transcription_failure",
];

export function isReviewCause(value: string): value is ReviewCause {
  return (CAUSES as string[]).includes(value);
}

export type IssueStatus = "open" | "in_progress" | "resolved" | "dismissed";

export const ISSUE_STATUSES: IssueStatus[] = ["open", "in_progress", "resolved", "dismissed"];

export type IssueSeverity = "critical" | "high" | "medium" | "low";

/**
 * What makes two occurrences the same cause.
 *
 * Callers do not repeat themselves word for word, so keying on the verbatim
 * question would file a new row every time and the queue would be a list of
 * incidents wearing a cause's clothes. The model supplies a short canonical
 * topic alongside what was actually said, and this reduces that to a stable
 * key: case, punctuation and spacing removed.
 *
 * This is honest about its limits. Two topics that mean the same thing in
 * different words still produce two rows — grouping by meaning needs
 * embeddings, which this system does not have. Under-grouping shows the same
 * cause twice, which someone can see and judge; over-grouping would merge two
 * different problems into one row and hide one of them.
 */
export function causeKeyFor(cause: ReviewCause, topic: string): string {
  const normalized = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 120);

  return `${cause}:${normalized || "unspecified"}`;
}

/**
 * Severity, derived rather than stored.
 *
 * It is a function of the kind of failure and how much of the business it has
 * now touched, and both halves matter: a connected system failing is serious
 * on its first call, and a single unanswered question becomes serious once it
 * is the fortieth caller asking it. Freezing this into a column at detection
 * time would leave a cause filed "low" on its first call still reading "low"
 * on its hundredth.
 */
export function severityFor(cause: ReviewCause, affectedCalls: number): IssueSeverity {
  const ladder: IssueSeverity[] = ["low", "medium", "high", "critical"];
  const base = cause === "tool_failure" ? 2 : cause === "transcription_failure" ? 0 : 1;
  const escalation = affectedCalls >= 20 ? 2 : affectedCalls >= 5 ? 1 : 0;

  return ladder[Math.min(base + escalation, ladder.length - 1)]!;
}

export type RaiseIssueInput = {
  workspaceId: string;
  aiEmployeeId: string | null;
  conversationId: string | null;
  cause: ReviewCause;
  /** Canonical short topic. Decides which existing cause this joins. */
  topic: string;
  title: string;
  detail: string;
  /** What was actually said, or the real error string. Never a paraphrase. */
  evidence?: string | null;
};

/**
 * Files an occurrence against its cause, opening the cause if it is new.
 *
 * A recurrence reopens a cause that was marked resolved — if it is happening
 * again it was not fixed, and silently leaving it closed would make the queue
 * lie about the present. A cause someone **dismissed** stays dismissed: that
 * was a judgement that this is not worth fixing, and reopening it on the next
 * occurrence would make dismissing it meaningless.
 */
export async function raiseIssue(input: RaiseIssueInput): Promise<string> {
  const causeKey = causeKeyFor(input.cause, input.topic);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.reviewIssue.findUnique({
      where: { workspaceId_causeKey: { workspaceId: input.workspaceId, causeKey } },
      select: { id: true, status: true },
    });

    const issue = existing
      ? await tx.reviewIssue.update({
          where: { id: existing.id },
          data: {
            lastSeenAt: now,
            ...(existing.status === "resolved" ? { status: "open" } : {}),
          },
          select: { id: true },
        })
      : await tx.reviewIssue.create({
          data: {
            workspaceId: input.workspaceId,
            aiEmployeeId: input.aiEmployeeId,
            causeKey,
            cause: input.cause,
            title: input.title,
            detail: input.detail,
            status: "open",
            firstSeenAt: now,
            lastSeenAt: now,
          },
          select: { id: true },
        });

    // One event per call, so blast radius counts calls rather than mentions —
    // a caller who asks the same unanswerable question three times in one call
    // is one affected call. An occurrence with no conversation behind it is
    // always recorded, because there is nothing to deduplicate it against.
    if (input.conversationId) {
      const already = await tx.reviewIssueEvent.findFirst({
        where: { issueId: issue.id, conversationId: input.conversationId },
        select: { id: true },
      });
      if (already) return issue.id;
    }

    await tx.reviewIssueEvent.create({
      data: {
        issueId: issue.id,
        conversationId: input.conversationId,
        detail: input.evidence ?? null,
        detectedAt: now,
      },
    });

    return issue.id;
  });
}

/**
 * Raising a review issue must never take down whatever was doing the real
 * work. A cause we failed to file is a gap in the queue; an exception thrown
 * out of a live call teardown or a mid-call tool is a dropped call.
 */
export async function raiseIssueSafely(input: RaiseIssueInput): Promise<void> {
  try {
    await raiseIssue(input);
  } catch (error) {
    console.error(
      "[REVIEW] could not raise issue:",
      error instanceof Error ? error.message : error,
    );
  }
}

/** How many evidence calls a single issue carries to the frontend. */
const EVIDENCE_LIMIT = 5;

export type ReviewIssueView = {
  id: string;
  cause: ReviewCause;
  title: string;
  detail: string;
  severity: IssueSeverity;
  status: IssueStatus;
  affectedConversationCount: number;
  evidenceConversationIds: string[];
  employeeId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  assignedToUserId: string | null;
};

type IssueWithEvents = {
  id: string;
  cause: string;
  title: string;
  detail: string;
  status: string;
  aiEmployeeId: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  assignedToUserId: string | null;
  events: { conversationId: string | null; detectedAt: Date }[];
};

function toView(issue: IssueWithEvents): ReviewIssueView {
  // Distinct calls, not events: two occurrences on one call are one affected
  // call, and the queue ranks on this number.
  const conversationIds: string[] = [];
  for (const event of issue.events) {
    if (event.conversationId && !conversationIds.includes(event.conversationId)) {
      conversationIds.push(event.conversationId);
    }
  }

  const cause = isReviewCause(issue.cause) ? issue.cause : "missing_knowledge";

  return {
    id: issue.id,
    cause,
    title: issue.title,
    detail: issue.detail,
    severity: severityFor(cause, conversationIds.length),
    status: (ISSUE_STATUSES as string[]).includes(issue.status)
      ? (issue.status as IssueStatus)
      : "open",
    affectedConversationCount: conversationIds.length,
    evidenceConversationIds: conversationIds.slice(0, EVIDENCE_LIMIT),
    employeeId: issue.aiEmployeeId,
    firstSeenAt: issue.firstSeenAt.toISOString(),
    lastSeenAt: issue.lastSeenAt.toISOString(),
    assignedToUserId: issue.assignedToUserId,
  };
}

const EVENT_SELECTION = {
  orderBy: { detectedAt: "desc" },
  select: { conversationId: true, detectedAt: true },
} as const;

export async function listIssues(workspaceId: string): Promise<ReviewIssueView[]> {
  const issues = await prisma.reviewIssue.findMany({
    where: { workspaceId },
    orderBy: { lastSeenAt: "desc" },
    include: { events: EVENT_SELECTION },
  });

  return issues.map(toView);
}

export async function getIssue(
  workspaceId: string,
  issueId: string,
): Promise<ReviewIssueView | null> {
  const issue = await prisma.reviewIssue.findFirst({
    where: { id: issueId, workspaceId },
    include: { events: EVENT_SELECTION },
  });

  return issue ? toView(issue) : null;
}

export type UpdateIssueInput = {
  status?: IssueStatus;
  assignedToUserId?: string | null;
};

/**
 * Triage, not repair. Moving a cause to "being fixed" or dismissing it records
 * a judgement about the cause; it does not change what the AI employee says or
 * does. That change is made against a draft in Build and has to pass
 * simulation before a customer meets it.
 */
export async function updateIssue(
  workspaceId: string,
  issueId: string,
  input: UpdateIssueInput,
): Promise<ReviewIssueView | null> {
  const existing = await prisma.reviewIssue.findFirst({
    where: { id: issueId, workspaceId },
    select: { id: true },
  });
  if (!existing) return null;

  await prisma.reviewIssue.update({
    where: { id: existing.id },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.assignedToUserId !== undefined
        ? { assignedToUserId: input.assignedToUserId }
        : {}),
    },
  });

  return getIssue(workspaceId, issueId);
}

/**
 * Causes visible in how a call *ended*, as opposed to something the employee
 * noticed while it was still talking.
 *
 * Only three outcome codes describe a wall the AI hit. `completed` and
 * `caller_hung_up` are ordinary endings, and `abandoned` is the stale-call
 * sweep closing a row whose media socket never arrived — the caller rang off
 * while it rang, which is not a failure of anything the employee did and must
 * not appear in a queue of things to fix.
 */
const OUTCOME_CAUSES: Record<
  string,
  { cause: ReviewCause; topic: string; title: string; detail: string }
> = {
  no_speech: {
    cause: "transcription_failure",
    topic: "caller speech not recognised",
    title: "Calls where nothing the caller said was understood",
    detail:
      "The call connected and the employee spoke, but no speech came back that could be " +
      "transcribed. A caller on a bad line, heavy background noise, or a language the " +
      "speech recogniser is not configured for all end this way, and the caller hears a " +
      "voice asking questions it never gets an answer to.",
  },
  turn_limit: {
    cause: "unclear_scope",
    topic: "call reached the turn limit",
    title: "Calls that ran to the turn limit without reaching an end",
    detail:
      "The conversation hit its maximum number of turns and was closed by the system " +
      "rather than by either party finishing. A call that goes round this long is " +
      "usually one where the caller wants something the employee has no way to give " +
      "them, and neither side is able to say so.",
  },
  error: {
    cause: "tool_failure",
    topic: "voice pipeline error",
    title: "The voice pipeline failed mid-call",
    detail:
      "Something in the path between the caller and the language model failed while the " +
      "call was live. The caller was speaking to an employee that stopped being able to " +
      "answer, which is the failure mode a person most needs to know about.",
  },
};

export async function raiseFromCallOutcome(input: {
  workspaceId: string;
  aiEmployeeId: string | null;
  conversationId: string;
  outcomeCode: string;
}): Promise<void> {
  const mapped = OUTCOME_CAUSES[input.outcomeCode];
  if (!mapped) return;

  await raiseIssueSafely({
    workspaceId: input.workspaceId,
    aiEmployeeId: input.aiEmployeeId,
    conversationId: input.conversationId,
    cause: mapped.cause,
    topic: mapped.topic,
    title: mapped.title,
    detail: mapped.detail,
    evidence: `Call ended: ${input.outcomeCode}`,
  });
}
