import type { CapBehaviour, UsageSnapshot } from "@/lib/domain/types";
import * as api from "@/lib/services/http/usage";

/**
 * Real spend — metered off real calls — mapped onto the same `UsageSnapshot`
 * the Northgate fixtures use.
 *
 * The fifth of these bridges, after conversations, records, parties and
 * review, and the one where the honest-empty rule has the sharpest teeth,
 * because the subject is money. Everything the backend sends is either
 * measured (connected minutes, token counts) or arithmetic over it at rates
 * the operator configured. Nothing here is an invoice, because nothing in this
 * system can read one: Twilio bills the telephony and the model provider bills
 * the tokens, and neither bill is visible from inside the backend.
 *
 * `meter` is what carries that distinction up to the screen. Northgate's
 * fixture leaves it null and states a total the way a demo may; a real tenant
 * gets its derivation attached and the screen shows its working. The two are
 * never mixed — rule 12.
 */

const CAP_BEHAVIOURS: CapBehaviour[] = ["notify", "voicemail", "stop"];

function capBehaviour(raw: string): CapBehaviour {
  return (CAP_BEHAVIOURS as string[]).includes(raw) ? (raw as CapBehaviour) : "notify";
}

function blockedCaps(raw: Record<string, string>): Partial<Record<CapBehaviour, string>> {
  const blocked: Partial<Record<CapBehaviour, string>> = {};
  for (const behaviour of CAP_BEHAVIOURS) {
    const reason = raw[behaviour];
    if (reason) blocked[behaviour] = reason;
  }
  return blocked;
}

function mapSnapshot(snapshot: api.ApiUsageSnapshot): UsageSnapshot {
  return {
    spendToday: snapshot.spendToday,
    spendMonth: snapshot.spendMonth,
    budgetMonth: snapshot.budgetMonth,
    atCap: capBehaviour(snapshot.atCap),
    callsToday: snapshot.callsToday,
    costPerResolution: snapshot.costPerResolution,
    meter: {
      capReached: snapshot.meter.capReached,
      connectedMinutesMonth: snapshot.meter.connectedMinutesMonth,
      callsMonth: snapshot.meter.callsMonth,
      resolvedCallsMonth: snapshot.meter.resolvedCallsMonth,
      modelTokensMonth: snapshot.meter.modelTokensMonth,
      unmeteredCalls: snapshot.meter.unmeteredCalls,
      rates: snapshot.meter.rates,
    },
    capBlocked: blockedCaps(snapshot.capBlocked),
  };
}

export async function getRealUsage(workspaceId: string): Promise<UsageSnapshot> {
  return mapSnapshot(await api.getUsage(workspaceId));
}

export async function setRealBudget(
  workspaceId: string,
  update: { budgetMonth: number | null; atCap: CapBehaviour },
): Promise<UsageSnapshot> {
  return mapSnapshot(await api.setBudget(workspaceId, update));
}
