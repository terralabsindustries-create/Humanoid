import { Prisma } from "@prisma/client";
import { prisma } from "@/db/client.js";
import { env } from "@/config/env.js";

/**
 * Usage: what the calls cost, and what happens when that reaches the budget.
 *
 * The distinction everything in here is built around, and the one that keeps
 * this screen from becoming the fake-real backend rule 13 warns about:
 *
 *   - **Units are measured.** Connected seconds come off the call. Token
 *     counts come from the model provider's own usage report. Both are facts.
 *   - **Money is arithmetic.** It is those units multiplied by rates an
 *     operator typed into `.env`. Twilio invoices the telephony and the model
 *     provider invoices the tokens; neither invoice is readable from inside
 *     this process, and nothing here pretends otherwise. The snapshot carries
 *     the rates and the raw units up to the screen precisely so it can show
 *     its working instead of asserting a number.
 *
 * That is why `UsageSnapshot.meter` exists on the frontend: a real tenant's
 * spend renders with its derivation attached, and Northgate's fixture — which
 * is a stated invoice for a business that does not exist — renders without one.
 */

/** Rates in effect. Minor units of the workspace currency. */
export type UsageRates = {
  /** Per connected minute, covering voice + STT + TTS as one telephony leg. */
  voicePerMinute: number;
  modelInputPerMillionTokens: number;
  modelOutputPerMillionTokens: number;
};

export function currentRates(): UsageRates {
  return {
    voicePerMinute: env.USAGE_RATE_VOICE_PER_MINUTE,
    modelInputPerMillionTokens: env.USAGE_RATE_MODEL_INPUT_PER_MTOKEN,
    modelOutputPerMillionTokens: env.USAGE_RATE_MODEL_OUTPUT_PER_MTOKEN,
  };
}

export type CapBehaviour = "notify" | "voicemail" | "stop";

export const CAP_BEHAVIOURS: CapBehaviour[] = ["notify", "voicemail", "stop"];

export function isCapBehaviour(value: string): value is CapBehaviour {
  return (CAP_BEHAVIOURS as string[]).includes(value);
}

/**
 * Cap behaviours this system can actually carry out, and why the others
 * cannot.
 *
 * §3.11's rule for hard blocks applies here for the same reason it applies to
 * the authority matrix: an option removed from the list cannot be asked about,
 * so someone wondering "can I send overflow calls to voicemail?" gets no
 * answer at all. Rendering it with its reason answers the question.
 *
 * `voicemail` is blocked because there is no voicemail. Recording a message
 * needs somewhere for it to land and someone to be told it landed, and this
 * system has neither — offering the choice would mean callers silently talking
 * into nothing at exactly the moment the business had decided to stop paying
 * attention.
 */
export const CAP_BEHAVIOUR_BLOCKS: Partial<Record<CapBehaviour, string>> = {
  voicemail:
    "There is no voicemail box yet. Nothing in this system records a message, stores it, or tells anyone it arrived, so choosing this would leave callers talking to nobody.",
};

export function isCapBehaviourAvailable(behaviour: CapBehaviour): boolean {
  return CAP_BEHAVIOUR_BLOCKS[behaviour] === undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metering
// ─────────────────────────────────────────────────────────────────────────────

/** Tokens a call burned, as reported by the provider. */
export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  /** False means nobody counted — not that nothing was used. */
  metered: boolean;
};

export type RecordCallUsageInput = {
  workspaceId: string;
  conversationId: string;
  startedAt: Date;
  endedAt: Date;
  tokens?: TokenUsage | null;
};

/**
 * Telephony is billed by the started minute, everywhere. Rounding a 61-second
 * call down to one minute would under-report every call in the system by up to
 * a minute, which on a phone line is most of the bill.
 */
function billedMinutes(connectedSeconds: number): number {
  return Math.ceil(Math.max(0, connectedSeconds) / 60);
}

export function priceCall(
  connectedSeconds: number,
  tokens: TokenUsage | null | undefined,
  rates: UsageRates,
): { telephonyCost: number; modelCost: number } {
  const telephonyCost = billedMinutes(connectedSeconds) * rates.voicePerMinute;

  const input = tokens?.metered ? tokens.inputTokens : 0;
  const output = tokens?.metered ? tokens.outputTokens : 0;
  const modelCost =
    (input / 1_000_000) * rates.modelInputPerMillionTokens +
    (output / 1_000_000) * rates.modelOutputPerMillionTokens;

  return { telephonyCost, modelCost };
}

/**
 * Writes what one call consumed.
 *
 * Called from `endCall`, which is the single point both transports — the
 * realtime relay and the `<Gather>` fallback — pass through, for the same
 * reason the review detector hangs there: a meter attached to one of them and
 * forgotten on the other would under-report spend in a way nobody would ever
 * notice.
 *
 * Never throws. A missing usage row understates a month's spend; an exception
 * thrown out of a call teardown drops the last line of a transcript.
 */
export async function recordCallUsage(input: RecordCallUsageInput): Promise<void> {
  try {
    const rates = currentRates();
    const connectedSeconds = Math.max(
      0,
      Math.round((input.endedAt.getTime() - input.startedAt.getTime()) / 1000),
    );
    const { telephonyCost, modelCost } = priceCall(connectedSeconds, input.tokens, rates);

    await prisma.callUsage.upsert({
      where: { conversationId: input.conversationId },
      create: {
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        connectedSeconds,
        modelInputTokens: input.tokens?.inputTokens ?? 0,
        modelOutputTokens: input.tokens?.outputTokens ?? 0,
        tokensMetered: input.tokens?.metered ?? false,
        telephonyCost: new Prisma.Decimal(telephonyCost.toFixed(4)),
        modelCost: new Prisma.Decimal(modelCost.toFixed(4)),
        ratesJson: { ...rates },
        occurredAt: input.endedAt,
      },
      // A retried webhook must not bill the same call twice.
      update: {
        connectedSeconds,
        modelInputTokens: input.tokens?.inputTokens ?? 0,
        modelOutputTokens: input.tokens?.outputTokens ?? 0,
        tokensMetered: input.tokens?.metered ?? false,
        telephonyCost: new Prisma.Decimal(telephonyCost.toFixed(4)),
        modelCost: new Prisma.Decimal(modelCost.toFixed(4)),
        ratesJson: { ...rates },
        occurredAt: input.endedAt,
      },
    });
  } catch (error) {
    console.error(
      "[USAGE] could not record call usage:",
      error instanceof Error ? error.message : error,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start of the calendar month, and of today, in the workspace's own timezone.
 *
 * A billing month that rolled over at UTC midnight would tell a Los Angeles
 * business its month ended while it was still mid-afternoon on the last day —
 * and the same reasoning that made `getStats` compute "today" in the
 * workspace's timezone applies with more force to money.
 */
function periodBoundsIn(timezone: string, now: Date): { monthStart: Date; dayStart: Date } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const secondsIntoDay = get("hour") * 3600 + get("minute") * 60 + get("second");
  const dayStart = new Date(now.getTime() - secondsIntoDay * 1000);
  // `day` is 1-indexed, so day 1 is already the first day of the month.
  const monthStart = new Date(dayStart.getTime() - (get("day") - 1) * 86_400_000);

  return { monthStart, dayStart };
}

export type UsageSnapshotView = {
  spendToday: number;
  spendMonth: number;
  budgetMonth: number | null;
  atCap: CapBehaviour;
  callsToday: number;
  costPerResolution: number;
  meter: {
    capReached: boolean;
    connectedMinutesMonth: number;
    callsMonth: number;
    resolvedCallsMonth: number;
    /** Null when no call this month reported token counts. */
    modelTokensMonth: number | null;
    /** Calls this month whose token use nobody counted. */
    unmeteredCalls: number;
    rates: UsageRates;
    currency: string;
  };
  capBlocked: Partial<Record<CapBehaviour, string>>;
};

/**
 * A telephony and a model total into whole minor units.
 *
 * Added before rounding, not after. Rounding each half separately can differ
 * from rounding the sum by a penny, and the month total and the day total
 * disagreeing by a penny on the same screen is the kind of thing that makes
 * someone stop trusting all of it.
 */
function toMinorUnits(
  telephony: Prisma.Decimal | null | undefined,
  model: Prisma.Decimal | null | undefined,
): number {
  return Math.round((telephony?.toNumber() ?? 0) + (model?.toNumber() ?? 0));
}

export async function getSnapshot(workspaceId: string): Promise<UsageSnapshotView | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { budgetMonthMinor: true, atCap: true, timezone: true },
  });
  if (!workspace) return null;

  const now = new Date();
  const { monthStart, dayStart } = periodBoundsIn(workspace.timezone, now);

  const [monthRows, todayTotals, callsToday, resolvedCallsMonth] = await Promise.all([
    prisma.callUsage.findMany({
      where: { workspaceId, occurredAt: { gte: monthStart } },
      select: {
        connectedSeconds: true,
        modelInputTokens: true,
        modelOutputTokens: true,
        tokensMetered: true,
        telephonyCost: true,
        modelCost: true,
      },
    }),
    prisma.callUsage.aggregate({
      where: { workspaceId, occurredAt: { gte: dayStart } },
      _sum: { telephonyCost: true, modelCost: true },
    }),
    prisma.conversation.count({ where: { workspaceId, startedAt: { gte: dayStart } } }),
    prisma.conversation.count({
      where: { workspaceId, startedAt: { gte: monthStart }, outcomeCode: "completed" },
    }),
  ]);

  let spendMonthExact = 0;
  let connectedSeconds = 0;
  let modelTokens = 0;
  let meteredCalls = 0;

  for (const row of monthRows) {
    spendMonthExact += row.telephonyCost.toNumber() + row.modelCost.toNumber();
    connectedSeconds += row.connectedSeconds;
    if (row.tokensMetered) {
      modelTokens += row.modelInputTokens + row.modelOutputTokens;
      meteredCalls += 1;
    }
  }

  const spendMonth = Math.round(spendMonthExact);
  const spendToday = toMinorUnits(todayTotals._sum.telephonyCost, todayTotals._sum.modelCost);

  return {
    spendToday,
    spendMonth,
    budgetMonth: workspace.budgetMonthMinor,
    atCap: isCapBehaviour(workspace.atCap) ? workspace.atCap : "notify",
    callsToday,
    // An average over nothing is not zero, but the frontend's type has no null
    // here and a resolution count of zero already renders as "no resolutions
    // yet" upstream of the number. Dividing is the only lie available; zero is
    // the less misleading one.
    costPerResolution:
      resolvedCallsMonth === 0 ? 0 : Math.round(spendMonth / resolvedCallsMonth),
    meter: {
      capReached: hasReachedCap(workspace.budgetMonthMinor, spendMonth),
      connectedMinutesMonth: Math.round(connectedSeconds / 60),
      callsMonth: monthRows.length,
      resolvedCallsMonth,
      modelTokensMonth: meteredCalls === 0 ? null : modelTokens,
      unmeteredCalls: monthRows.length - meteredCalls,
      rates: currentRates(),
      currency: "GBP",
    },
    capBlocked: CAP_BEHAVIOUR_BLOCKS,
  };
}

/** No budget is "tracked but uncapped" — nothing to reach, so nothing trips. */
function hasReachedCap(budgetMonth: number | null, spendMonth: number): boolean {
  return budgetMonth !== null && budgetMonth > 0 && spendMonth >= budgetMonth;
}

export type SetBudgetInput = {
  budgetMonth: number | null;
  atCap: CapBehaviour;
  actorUserId: string;
};

/**
 * Sets the budget and the behaviour at the cap, and records who changed what
 * from what.
 *
 * The audit row is written in the same transaction as the change rather than
 * after it, because the screen's own footnote promises the two arrive
 * together. A change that landed without its audit entry would be exactly the
 * failure that footnote exists to rule out.
 */
export async function setBudget(
  workspaceId: string,
  input: SetBudgetInput,
): Promise<UsageSnapshotView | null> {
  const before = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { budgetMonthMinor: true, atCap: true },
  });
  if (!before) return null;

  await prisma.$transaction([
    prisma.workspace.update({
      where: { id: workspaceId },
      data: { budgetMonthMinor: input.budgetMonth, atCap: input.atCap },
    }),
    prisma.auditEvent.create({
      data: {
        workspaceId,
        actorType: "user",
        actorId: input.actorUserId,
        action: "billing.budget_changed",
        resourceType: "workspace",
        resourceId: workspaceId,
        metadataJson: {
          before: { budgetMonth: before.budgetMonthMinor, atCap: before.atCap },
          after: { budgetMonth: input.budgetMonth, atCap: input.atCap },
        },
      },
    }),
  ]);

  return getSnapshot(workspaceId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Enforcement
// ─────────────────────────────────────────────────────────────────────────────

export type CapDecision =
  | { answer: true }
  | { answer: false; behaviour: CapBehaviour; budgetMonth: number; spendMonth: number };

/**
 * Whether this workspace's AI employee should answer the call in front of it.
 *
 * This is the half of the cap that makes it a limit rather than a preference.
 * `notify` deliberately still answers — that is what it means — and the
 * blocked behaviours are the ones that stop the line.
 *
 * Deliberately conservative on failure: a workspace whose spend cannot be read
 * still gets its calls answered. A metering outage that silently took a
 * business's phone line down would be a far worse failure than one that let it
 * overspend for an afternoon.
 */
export async function shouldAnswerCall(workspaceId: string): Promise<CapDecision> {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { budgetMonthMinor: true, atCap: true, timezone: true },
    });
    if (!workspace?.budgetMonthMinor) return { answer: true };

    const behaviour = isCapBehaviour(workspace.atCap) ? workspace.atCap : "notify";
    if (behaviour === "notify") return { answer: true };

    const { monthStart } = periodBoundsIn(workspace.timezone, new Date());
    const totals = await prisma.callUsage.aggregate({
      where: { workspaceId, occurredAt: { gte: monthStart } },
      _sum: { telephonyCost: true, modelCost: true },
    });
    const spendMonth = toMinorUnits(totals._sum.telephonyCost, totals._sum.modelCost);

    if (!hasReachedCap(workspace.budgetMonthMinor, spendMonth)) return { answer: true };

    return {
      answer: false,
      behaviour,
      budgetMonth: workspace.budgetMonthMinor,
      spendMonth,
    };
  } catch (error) {
    console.error(
      "[USAGE] could not evaluate the spend cap; answering the call:",
      error instanceof Error ? error.message : error,
    );
    return { answer: true };
  }
}
