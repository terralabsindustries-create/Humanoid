import { env } from "@/config/env.js";
import { prisma } from "@/db/client.js";
import { activeProvider, generateReply, type Turn } from "@/modules/telephony/llm.js";
import { endCall, recordTurn, startCall } from "@/modules/conversations/conversation.service.js";

/**
 * Turns a caller's transcribed speech into something the AI employee says back,
 * using the configuration onboarding already wrote to Postgres.
 *
 * Conversation state lives in memory, keyed by CallSid — deliberately not in
 * Postgres. Call transcripts are a real feature with their own tables and a
 * frontend surface; a Map that dies with the process is honestly temporary,
 * where a half-built `calls` table would look like the real thing.
 */

type ResolvedEmployee = {
  workspaceId: string;
  employeeId: string;
  employeeName: string;
  roleName: string;
  businessName: string;
  industryKey: string | null;
  timezone: string;
  behavior: unknown;
  escalationRules: unknown;
  operatingRules: unknown;
};

type Conversation = {
  employee: ResolvedEmployee;
  turns: Turn[];
  startedAt: number;
  /** Row in `conversations`. The in-memory turns are the model's working
   *  context; Postgres holds the durable transcript. */
  conversationId: string | null;
};

const conversations = new Map<string, Conversation>();

/** A call that never hangs up cleanly shouldn't leak its history forever. */
const CONVERSATION_TTL_MS = 60 * 60 * 1000;

export function isAiReceptionistEnabled(): boolean {
  return activeProvider() !== null;
}

/**
 * Which AI employee picks up. There is no phone-number → workspace mapping
 * yet, so this pins by env var if set and otherwise takes the most recently
 * configured employee. Both paths log which one answered, because silently
 * answering as the wrong tenant would be a very confusing bug.
 */
export async function resolveAiEmployee(): Promise<ResolvedEmployee | null> {
  const employee = await prisma.aiEmployee.findFirst({
    where: {
      ...(env.AI_EMPLOYEE_WORKSPACE_ID ? { workspaceId: env.AI_EMPLOYEE_WORKSPACE_ID } : {}),
      currentConfigurationVersionId: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      workspace: { include: { organization: true } },
      configurationVersions: true,
    },
  });

  if (!employee) return null;

  const version = employee.configurationVersions.find((v) => v.id === employee.currentConfigurationVersionId);
  if (!version) return null;

  return {
    workspaceId: employee.workspaceId,
    employeeId: employee.id,
    employeeName: employee.name,
    roleName: employee.roleName,
    businessName: employee.workspace?.name ?? employee.workspace?.organization?.name ?? "our business",
    industryKey: employee.workspace?.industryKey ?? null,
    timezone: employee.timezone,
    behavior: version.behaviorJson,
    escalationRules: version.escalationRulesJson,
    operatingRules: version.operatingRulesJson,
  };
}

/** Spoken immediately on pickup — no model round-trip, so there is no dead air. */
export function greetingFor(employee: ResolvedEmployee | null): string {
  if (!employee) return "Hello, thanks for calling. How can I help you today?";
  return `Thanks for calling ${employee.businessName}. This is ${employee.employeeName}. How can I help you today?`;
}

function buildSystemPrompt(employee: ResolvedEmployee): string {
  return [
    `You are ${employee.employeeName}, the ${employee.roleName} for ${employee.businessName}.`,
    `You are speaking with a customer on a live phone call. Their timezone is ${employee.timezone}.`,
    employee.industryKey ? `The business operates in: ${employee.industryKey}.` : "",
    "",
    "# Your configuration",
    "This was set by the business owner during setup. Follow it.",
    "",
    "## Behaviour",
    JSON.stringify(employee.behavior, null, 2),
    "",
    "## Escalation rules",
    JSON.stringify(employee.escalationRules, null, 2),
    "",
    "## Operating rules",
    JSON.stringify(employee.operatingRules, null, 2),
    "",
    "# Speaking on the phone",
    "Every word you write is read aloud by a speech synthesiser, so write speech, not text.",
    "Keep replies to one or two short sentences — a caller cannot skim, and a long answer is",
    "painful to sit through. Ask one question at a time and wait for the answer.",
    "Never use markdown, bullet points, numbered lists, headings, emoji, or symbols like * or #.",
    "Write numbers, dates and times the way you would say them out loud.",
    "Do not narrate what you are doing, do not describe your reasoning, and do not read out any",
    "internal or system tags.",
    "",
    "# Honesty",
    "You have no access to a calendar, customer records, or any business system yet, and no",
    "knowledge base beyond the configuration above. Do not invent availability, prices, opening",
    "hours, or booking confirmations. If you cannot answer from your configuration, say plainly",
    "that you will take the details and have a colleague follow up, then collect what is needed.",
    "The caller's speech reaches you through automatic transcription and may be misheard — if a",
    "name, number, or date matters, read it back to confirm.",
  ]
    .filter(Boolean)
    .join("\n");
}

function evictStaleConversations(): void {
  const cutoff = Date.now() - CONVERSATION_TTL_MS;
  for (const [callSid, conversation] of conversations) {
    if (conversation.startedAt < cutoff) conversations.delete(callSid);
  }
}

export type StartCallContext = { from: string; to: string };

/**
 * Opens the durable record and the in-memory working context together.
 * A persistence failure must not drop the call, so it degrades to an
 * unrecorded conversation rather than throwing at the caller.
 */
export async function startConversation(
  callSid: string,
  employee: ResolvedEmployee,
  context: StartCallContext,
): Promise<void> {
  evictStaleConversations();

  let conversationId: string | null = null;
  try {
    conversationId = await startCall({
      workspaceId: employee.workspaceId,
      aiEmployeeId: employee.employeeId,
      providerCallId: callSid,
      fromNumber: context.from,
      toNumber: context.to,
      language: env.TWILIO_SPEECH_LANGUAGE,
    });
  } catch (error) {
    console.error("[Twilio] could not record call:", error instanceof Error ? error.message : error);
  }

  conversations.set(callSid, { employee, turns: [], startedAt: Date.now(), conversationId });
}

/** `outcomeCode`: completed | no_speech | turn_limit | error */
export async function endConversation(callSid: string, outcomeCode = "completed"): Promise<void> {
  const conversation = conversations.get(callSid);
  conversations.delete(callSid);
  if (!conversation?.conversationId) return;

  try {
    await endCall(conversation.conversationId, outcomeCode);
  } catch (error) {
    console.error("[Twilio] could not finalise call:", error instanceof Error ? error.message : error);
  }
}

/** Persists what the caller said, including on calls with no model configured. */
export async function recordCallerTurn(
  callSid: string,
  text: string,
  confidence: number | null,
): Promise<void> {
  const conversation = conversations.get(callSid);
  if (!conversation?.conversationId) return;
  try {
    await recordTurn({
      conversationId: conversation.conversationId,
      speakerType: "customer",
      text,
      confidence,
    });
  } catch (error) {
    console.error("[Twilio] could not record turn:", error instanceof Error ? error.message : error);
  }
}

export type ReplyResult = { text: string; reason: "ok" | "refusal" | "truncated" | "error" };

/**
 * One conversational turn. Never throws — a phone call cannot show a stack
 * trace, so every failure becomes something sayable plus a logged error.
 */
export async function replyTo(callSid: string, spokenByCaller: string): Promise<ReplyResult> {
  const conversation = conversations.get(callSid);
  if (!conversation) {
    return { text: "Sorry, I lost track of our conversation. Could you start again?", reason: "error" };
  }

  conversation.turns.push({ role: "user", text: spokenByCaller });
  const startedAt = Date.now();

  try {
    const reply = await generateReply(buildSystemPrompt(conversation.employee), conversation.turns);

    if (reply.reason === "refusal") {
      conversation.turns.pop();
      return { text: "Sorry, I can't help with that one. Is there something else I can do?", reason: "refusal" };
    }

    if (reply.text.length === 0) {
      conversation.turns.pop();
      return { text: "Sorry, I didn't catch that. Could you say it again?", reason: "error" };
    }

    conversation.turns.push({ role: "assistant", text: reply.text });

    if (conversation.conversationId) {
      try {
        await recordTurn({
          conversationId: conversation.conversationId,
          speakerType: "ai",
          text: reply.text,
          latencyMs: Date.now() - startedAt,
        });
      } catch (error) {
        console.error("[Twilio] could not record reply:", error instanceof Error ? error.message : error);
      }
    }

    return reply;
  } catch (error) {
    conversation.turns.pop();
    console.error("[Twilio] AI reply failed:", error instanceof Error ? error.message : error);
    return { text: "Sorry, I'm having trouble right now. Could you say that again?", reason: "error" };
  }
}
