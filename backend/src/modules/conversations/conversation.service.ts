import { prisma } from "@/db/client.js";

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
      direction: "inbound",
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
        metadataJson: input.latencyMs != null ? { latencyMs: input.latencyMs } : {},
      },
    });
  });
}

/** `outcomeCode`: completed | no_speech | turn_limit | error */
export async function endCall(conversationId: string, outcomeCode: string): Promise<void> {
  const endedAt = new Date();

  // The first caller turn is the closest thing we have to an intent, and it
  // beats an empty list row. A real summary needs a model pass, which is its
  // own feature.
  const firstCustomerTurn = await prisma.conversationMessage.findFirst({
    where: { conversationId, speakerType: "customer" },
    orderBy: { sequenceNumber: "asc" },
    select: { textContent: true },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: outcomeCode === "error" ? "failed" : "completed",
      endedAt,
      outcomeCode,
      summary: firstCustomerTurn?.textContent ?? null,
      callSession: { update: { status: "completed", endedAt } },
    },
  });
}

export async function listConversations(workspaceId: string, limit = 50) {
  return prisma.conversation.findMany({
    where: { workspaceId },
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
