import { prisma } from "@/db/client.js";
import { isIdentifiablePhone, NAME_FACT_LABEL } from "@/modules/parties/party.service.js";
import { listUpcomingBookingsForPhone, type CallerBooking } from "@/modules/records/record.service.js";

/**
 * What this business already knows about whoever is on the line, assembled at
 * the moment the phone rings.
 *
 * Without it every call opens as though it were the first one. The directory,
 * the transcript history and the diary all exist and all key on the same
 * number the carrier hands us — the employee simply was not being told, so a
 * regular rang, gave their name for the fourth time, and re-explained a
 * booking the business could already see.
 *
 * Two rules keep it honest, and they are the whole design:
 *
 * 1. **A name nobody checked is a claim, not a fact.** It reached us through
 *    speech recognition, so the greeting *asks* ("Am I speaking with Asha?")
 *    where it would otherwise assert. Once a person has confirmed it in the
 *    directory it is used flatly, because then somebody has actually vouched
 *    for it. Getting this backwards means opening a call by confidently
 *    calling a stranger by the wrong name.
 * 2. **The number is the household, not the person.** One phone can belong to
 *    several people — which is exactly how a booking ended up displaying the
 *    wrong name — so recognition is framed as "this number has called before",
 *    and the caller is given every chance to say they are somebody else.
 */

export type CallerContext = {
  partyId: string;
  /** The name on the directory record, if anybody has given one. */
  name: string | null;
  /** A person confirmed it. Until then it is whatever the last call heard. */
  nameConfirmed: boolean;
  /** Completed calls before this one. Zero means a first-time caller. */
  previousCalls: number;
  lastCallAt: Date | null;
  /** What they have booked and not yet been to. */
  upcoming: CallerBooking[];
};

export type RecogniseCallerInput = {
  workspaceId: string;
  phone: string | null | undefined;
  /**
   * This call's own row, excluded from the history.
   *
   * The inbound webhook opens the conversation and files the caller before
   * this ever runs, so counting naively would greet a first-time caller as a
   * returning one and report "last called: a moment ago" on every call.
   */
  currentConversationId?: string | null;
};

/**
 * Everything known about this caller, or null when there is nothing to know.
 *
 * Null is the honest answer for a withheld number and for a first-time
 * caller alike: there is no record to recognise, and the greeting stays the
 * one a stranger gets. Never throws — a phone that is already ringing must
 * not be dropped because a lookup failed.
 */
export async function recogniseCaller(input: RecogniseCallerInput): Promise<CallerContext | null> {
  if (!isIdentifiablePhone(input.phone)) return null;
  const phone = input.phone.trim();

  try {
    const party = await prisma.party.findUnique({
      where: { workspaceId_primaryPhone: { workspaceId: input.workspaceId, primaryPhone: phone } },
      select: {
        id: true,
        facts: { where: { label: NAME_FACT_LABEL }, select: { value: true, source: true } },
      },
    });
    if (!party) return null;

    const earlierCalls = {
      workspaceId: input.workspaceId,
      partyId: party.id,
      ...(input.currentConversationId ? { id: { not: input.currentConversationId } } : {}),
    };

    const [previousCalls, mostRecent, upcoming] = await Promise.all([
      prisma.conversation.count({ where: earlierCalls }),
      prisma.conversation.findFirst({
        where: earlierCalls,
        orderBy: { startedAt: "desc" },
        select: { startedAt: true },
      }),
      listUpcomingBookingsForPhone(input.workspaceId, phone),
    ]);

    const nameFact = party.facts[0];

    return {
      partyId: party.id,
      name: nameFact?.value ?? null,
      nameConfirmed: nameFact?.source === "verified",
      previousCalls,
      lastCallAt: mostRecent?.startedAt ?? null,
      upcoming,
    };
  } catch (error) {
    console.error(
      "[VOICE] could not look the caller up:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/** Whether there is anything here worth the employee knowing. */
export function isReturningCaller(caller: CallerContext | null): caller is CallerContext {
  return caller !== null && (caller.previousCalls > 0 || caller.upcoming.length > 0);
}

/** A date said the way somebody would say it on the phone. */
export function spokenDate(instant: Date | null, timeZone: string): string {
  if (!instant) return "no time set";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(instant);
  } catch {
    return instant.toISOString();
  }
}

/** How long ago, roughly — "yesterday", "last week". Never a timestamp. */
export function roughlyAgo(instant: Date | null, now: Date = new Date()): string | null {
  if (!instant) return null;
  const days = Math.floor((now.getTime() - instant.getTime()) / 86_400_000);
  if (days <= 0) return "earlier today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}
