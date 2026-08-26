import type { Prisma } from "@prisma/client";
import { prisma } from "@/db/client.js";
import { raiseFromCallOutcome } from "@/modules/review/review.service.js";
import { recordCallUsage } from "@/modules/usage/usage.service.js";
import type { TokenUsage } from "@/modules/telephony/llm.js";

/**
 * Conversations: recording what happened on a call, and reading it back.
 *
 * The write side is driven by the telephony webhooks; the read side feeds the
 * dashboard and the conversation list. Everything here is derived from data we
 * actually captured — there is no estimation, and metrics we cannot compute
 * from a transcript (bookings, revenue, sentiment) are deliberately absent
 * rather than approximated.
 */

export type StartCallInput = {
  workspaceId: string;
  aiEmployeeId: string | null;
  providerCallId: string;
  fromNumber: string;
  toNumber: string;
  language: string;
  /** Who dialled. Decides which end of the call the human is on. */
  direction?: "inbound" | "outbound";
};

/**
 * Idempotent on Twilio's CallSid: Twilio retries webhooks, and a retry must
 * resume the existing call rather than start a second one.
 */
export async function startCall(input: StartCallInput): Promise<string> {
  const existing = await prisma.callSession.findUnique({
    where: { providerCallId: input.providerCallId },
    select: { conversationId: true },
  });
  if (existing) return existing.conversationId;

  const conversation = await prisma.conversation.create({
    data: {
      workspaceId: input.workspaceId,
      aiEmployeeId: input.aiEmployeeId,
      channelType: "voice",
      direction: input.direction ?? "inbound",
      status: "active",
      language: input.language,
      callSession: {
        create: {
          provider: "twilio",
          providerCallId: input.providerCallId,
          fromNumber: input.fromNumber,
          toNumber: input.toNumber,
          status: "in_progress",
          connectedAt: new Date(),
        },
      },
    },
    select: { id: true },
  });

  return conversation.id;
}

export type RecordTurnInput = {
  conversationId: string;
  speakerType: "customer" | "ai";
  text: string;
  confidence?: number | null;
  /** Model round-trip in ms, for AI turns. Kept for latency analysis. */
  latencyMs?: number | null;
  /**
   * Merged into `metadata_json` alongside `latencyMs`. The realtime voice path
   * uses it to record time-to-first-token and whether the caller talked over
   * this turn — facts about how the turn was produced, not about what was
   * said, which is why they live here and not in new columns.
   */
  metadata?: Prisma.InputJsonObject;
};

export async function recordTurn(input: RecordTurnInput): Promise<void> {
  // sequence_number is unique per conversation, so derive it from the current
  // count inside the same transaction as the insert.
  await prisma.$transaction(async (tx) => {
    const count = await tx.conversationMessage.count({
      where: { conversationId: input.conversationId },
    });

    await tx.conversationMessage.create({
      data: {
        conversationId: input.conversationId,
        sequenceNumber: count + 1,
        speakerType: input.speakerType,
        contentType: "text",
        textContent: input.text,
        confidence: input.confidence ?? null,
        metadataJson: {
          ...(input.latencyMs != null ? { latencyMs: input.latencyMs } : {}),
          ...(input.metadata ?? {}),
        },
      },
    });
  });
}

/** `outcomeCode`: completed | no_speech | turn_limit | caller_hung_up | error */
export async function endCall(
  conversationId: string,
  outcomeCode: string,
  latencyMetrics?: Prisma.InputJsonObject,
  tokens?: TokenUsage | null,
): Promise<void> {
  const endedAt = new Date();

  // The first caller turn is the closest thing we have to an intent, and it
  // beats an empty list row. A real summary needs a model pass, which is its
  // own feature.
  const firstCustomerTurn = await prisma.conversationMessage.findFirst({
    where: { conversationId, speakerType: "customer" },
    orderBy: { sequenceNumber: "asc" },
    select: { textContent: true },
  });

  const conversation = await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: outcomeCode === "error" || outcomeCode === "abandoned" ? "failed" : "completed",
      endedAt,
      outcomeCode,
      summary: firstCustomerTurn?.textContent ?? null,
      callSession: {
        update: {
          status: "completed",
          endedAt,
          ...(latencyMetrics ? { latencyMetricsJson: latencyMetrics } : {}),
        },
      },
    },
    select: { workspaceId: true, aiEmployeeId: true, startedAt: true },
  });

  // Metered here, rather than in the relay session, for the same reason the
  // review detector lives here: this is the one point both transports pass
  // through. A meter wired into the realtime path and forgotten on the
  // `<Gather>` fallback would under-report spend in a way nobody would notice
  // until an invoice disagreed with the screen.
  await recordCallUsage({
    workspaceId: conversation.workspaceId,
    conversationId,
    startedAt: conversation.startedAt,
    endedAt,
    tokens,
  });

  // Some causes are only visible in how a call ended, and this is the one
  // place both transports funnel through — the realtime relay and the
  // `<Gather>` loop each finish here, so the detector cannot be attached to
  // one and forgotten on the other. `abandonStaleCalls` deliberately does not
  // come through here: a row closed by the sweep is a caller who rang off
  // while it rang, which is not a wall the employee hit.
  await raiseFromCallOutcome({
    workspaceId: conversation.workspaceId,
    aiEmployeeId: conversation.aiEmployeeId,
    conversationId,
    outcomeCode,
  });
}

/**
 * Closes out calls that are still marked live but cannot possibly be.
 *
 * A conversation row is opened by the inbound webhook, before Twilio has
 * connected the media socket. If that socket never arrives — the caller hung
 * up while it rang, the tunnel was down, the process restarted mid-call —
 * nothing ever calls `endCall`, and the row stays `active` forever. It then
 * shows up as a permanently live call in the sidebar, the live rail and the
 * conversation list, which is worse than useless: it is a dashboard that lies
 * about what is happening right now.
 *
 * Live session state lives in memory keyed by CallSid, so at boot *every*
 * active row is stale by definition — nothing survived the restart. While
 * running, `activeCallSids` is the set that genuinely is live, and anything
 * else older than `olderThanMs` has been abandoned.
 *
 * Returns how many were closed.
 */
export async function abandonStaleCalls(options: {
  olderThanMs: number;
  activeCallSids: string[];
}): Promise<number> {
  const endedAt = new Date();

  // At boot (`olderThanMs: 0`) the intent is "everything active", and applying
  // an age filter there would make correctness depend on this process's clock
  // agreeing with Postgres's — a few milliseconds of skew is enough to leave a
  // row behind, which is exactly what it did.
  const age =
    options.olderThanMs > 0
      ? { startedAt: { lt: new Date(Date.now() - options.olderThanMs) } }
      : {};

  const stale = await prisma.conversation.findMany({
    where: {
      status: "active",
      ...age,
      ...(options.activeCallSids.length > 0
        ? { callSession: { providerCallId: { notIn: options.activeCallSids } } }
        : {}),
    },
    select: { id: true },
  });

  if (stale.length === 0) return 0;

  const ids = stale.map((c) => c.id);
  await prisma.$transaction([
    prisma.conversation.updateMany({
      where: { id: { in: ids } },
      data: { status: "failed", outcomeCode: "abandoned", endedAt },
    }),
    prisma.callSession.updateMany({
      where: { conversationId: { in: ids } },
      data: { status: "no_answer", endedAt },
    }),
  ]);

  return stale.length;
}

export async function listConversations(
  workspaceId: string,
  options: { limit?: number; partyId?: string } = {},
) {
  const limit = options.limit ?? 50;
  return prisma.conversation.findMany({
    where: { workspaceId, ...(options.partyId ? { partyId: options.partyId } : {}) },
    orderBy: { startedAt: "desc" },
    take: Math.min(limit, 200),
    include: {
      callSession: true,
      aiEmployee: { select: { id: true, name: true, roleName: true } },
      _count: { select: { messages: true } },
    },
  });
}

export async function getConversation(workspaceId: string, conversationId: string) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    include: {
      callSession: true,
      aiEmployee: { select: { id: true, name: true, roleName: true } },
      messages: { orderBy: { sequenceNumber: "asc" } },
    },
  });
}

/** Midnight in the workspace's own timezone — "today" has to mean their today. */
function startOfDayIn(timezone: string): Date {
  const now = new Date();
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(now);
  } catch {
    // An invalid timezone string shouldn't take the dashboard down.
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const secondsIntoDay = get("hour") * 3600 + get("minute") * 60 + get("second");
  return new Date(now.getTime() - secondsIntoDay * 1000);
}

export type ConversationStats = {
  callsToday: number;
  callsTotal: number;
  /** Null until at least one call has finished — an average of nothing is not 0. */
  avgDurationSeconds: number | null;
  avgTurnsPerCall: number | null;
  completedCalls: number;
  failedCalls: number;
  activeCalls: number;
};

export async function getStats(workspaceId: string, timezone: string): Promise<ConversationStats> {
  const since = startOfDayIn(timezone);

  const [callsToday, callsTotal, completedCalls, failedCalls, activeCalls, finished, messageCount] =
    await Promise.all([
      prisma.conversation.count({ where: { workspaceId, startedAt: { gte: since } } }),
      prisma.conversation.count({ where: { workspaceId } }),
      prisma.conversation.count({ where: { workspaceId, status: "completed" } }),
      prisma.conversation.count({ where: { workspaceId, status: "failed" } }),
      prisma.conversation.count({ where: { workspaceId, status: "active" } }),
      prisma.conversation.findMany({
        where: { workspaceId, endedAt: { not: null } },
        select: { startedAt: true, endedAt: true },
      }),
      prisma.conversationMessage.count({ where: { conversation: { workspaceId } } }),
    ]);

  const avgDurationSeconds =
    finished.length === 0
      ? null
      : Math.round(
          finished.reduce((sum, c) => sum + (c.endedAt!.getTime() - c.startedAt.getTime()), 0) /
            finished.length /
            1000,
        );

  return {
    callsToday,
    callsTotal,
    avgDurationSeconds,
    avgTurnsPerCall: callsTotal === 0 ? null : Math.round((messageCount / callsTotal) * 10) / 10,
    completedCalls,
    failedCalls,
    activeCalls,
  };
}
