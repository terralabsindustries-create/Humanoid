import type { ToolDefinition, ToolRunner } from "@/modules/telephony/llm.js";
import { raiseIssueSafely, type ReviewCause } from "@/modules/review/review.service.js";

/**
 * How a wall the employee hits mid-call reaches the people who can remove it.
 *
 * `create_booking` is the employee doing something for the caller. This is the
 * employee reporting something it *could not* do — and it is the only way the
 * Review queue learns about a cause while the call is still happening, rather
 * than inferring one afterwards from how the call ended.
 *
 * The model raises it rather than a phrase match over the transcript, for the
 * same reason the model decides when a call is over: only the model knows
 * whether "I'll have a colleague call you back" was a real dead end or a
 * polite way of routing a question it had already answered. A phrase matcher
 * would file both, and a queue full of false causes is one nobody reads.
 *
 * The caller never hears anything about this. Flagging is silent — the
 * employee still has to handle the call gracefully, and telling someone their
 * question has been added to a work queue is not a service.
 */

export const ESCALATION_TOOL_NAME = "flag_unresolved";

/**
 * The reasons the model may give, and the cause each becomes.
 *
 * A closed set rather than free text, because these are the causes this
 * system can act on. Left open, a model will invent categories and the queue's
 * facets stop being a real cut of anything.
 */
const REASON_CAUSES: Record<string, ReviewCause> = {
  no_answer: "missing_knowledge",
  rule_unclear: "policy_ambiguity",
  not_allowed: "unclear_scope",
  system_failed: "tool_failure",
};

const TITLES: Record<ReviewCause, (topic: string) => string> = {
  missing_knowledge: (topic) => `No approved answer for ${topic}`,
  policy_ambiguity: (topic) => `The rule covering ${topic} is unclear`,
  unclear_scope: (topic) => `${topic} is outside what this employee handles`,
  tool_failure: (topic) => `A connected system failed: ${topic}`,
  transcription_failure: (topic) => `Speech not understood: ${topic}`,
};

const DETAILS: Record<ReviewCause, string> = {
  missing_knowledge:
    "Callers are asking this and the employee has nothing approved to tell them. It has " +
    "been taking details and promising a follow-up instead, which means a person is " +
    "handling every one of these calls a second time.",
  policy_ambiguity:
    "The employee's configuration covers this, but not clearly enough to act on. It has " +
    "been erring towards caution, which is the right instinct and the wrong outcome — " +
    "the caller still leaves without an answer.",
  unclear_scope:
    "Callers are asking for something this employee has no way to do. Either it needs " +
    "to be able to do it, or it needs a better answer than the one it is currently " +
    "improvising.",
  tool_failure:
    "Something the employee relies on did not respond while a caller was on the line. " +
    "Until it does, every caller who needs it gets a promise instead of an outcome.",
  transcription_failure:
    "What the caller said did not reach the employee in a usable form.",
};

export const escalationTool: ToolDefinition = {
  name: ESCALATION_TOOL_NAME,
  description:
    "Report that you have hit something you cannot resolve on this call, so the business " +
    "can fix it. Use it when a caller asks something you have no approved answer for, when " +
    "your instructions do not clearly cover their situation, when they want something you " +
    "are not able to do, or when something you tried failed. Call it once per distinct " +
    "problem, at the moment you realise you are stuck. It is silent — the caller hears " +
    "nothing — so carry on handling the call as well as you can afterwards. Do not use it " +
    "for a question you were able to answer.",
  parameters: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description:
          "What the caller actually asked or wanted, in their own words as closely as you can.",
      },
      topic: {
        type: "string",
        description:
          "The same thing in three to five words, phrased the way you would phrase it for " +
          "any caller asking it — no names, dates or details specific to this one. This " +
          "groups repeat occurrences, so keep it consistent: 'parking availability', " +
          "'late checkout policy', 'NHS registration'.",
      },
      reason: {
        type: "string",
        enum: Object.keys(REASON_CAUSES),
        description:
          "no_answer: you have no approved information covering it. rule_unclear: your " +
          "instructions cover it but not clearly enough to act. not_allowed: it is " +
          "something you are not able to do. system_failed: you tried and something broke.",
      },
    },
    required: ["question", "topic", "reason"],
  },
};

export type EscalationContext = {
  workspaceId: string;
  aiEmployeeId: string | null;
  conversationId: string | null;
};

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Handles one `flag_unresolved` call. Returns null for any other tool name. */
export async function runEscalation(
  context: EscalationContext,
  args: Record<string, unknown>,
): Promise<string> {
  const topic = asText(args.topic);
  const question = asText(args.question);

  if (!topic) {
    return "That did not work: no topic was given. Carry on with the call.";
  }

  const rawReason = asText(args.reason) ?? "";
  // An unrecognised reason is still a real dead end, and dropping it because
  // the model picked a word outside the enum would lose the occurrence
  // entirely. Filing it under the commonest cause keeps the count true.
  const cause = REASON_CAUSES[rawReason] ?? "missing_knowledge";

  await raiseIssueSafely({
    workspaceId: context.workspaceId,
    aiEmployeeId: context.aiEmployeeId,
    conversationId: context.conversationId,
    cause,
    topic,
    title: TITLES[cause](topic),
    detail: DETAILS[cause],
    evidence: question,
  });

  console.log(`[VOICE] flagged unresolved (${cause}) — ${topic}`);

  return (
    "Noted for the business. Say nothing about this to the caller — carry on and help " +
    "them as best you can, including taking their details for a follow-up if that is all " +
    "you can offer."
  );
}

/** Builds a runner bound to one call, so a flag can only ever reach its own tenant. */
export function escalationRunner(context: EscalationContext): ToolRunner {
  return async (name, args) => {
    if (name !== ESCALATION_TOOL_NAME) {
      return `There is no tool called ${name}. Tell the caller you cannot do that yet.`;
    }
    return runEscalation(context, args);
  };
}
