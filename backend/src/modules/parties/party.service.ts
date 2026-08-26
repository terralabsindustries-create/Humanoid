import type { Prisma } from "@prisma/client";
import { prisma } from "@/db/client.js";

/**
 * The customer directory: who the AI employee has been speaking to, and what
 * it believes about them.
 *
 * The screen this backs (`/customers`) exists to answer one question about a
 * person — *what does the AI think it knows, and did anybody check?* — so
 * every claim carries provenance, and the only thing that turns "the AI
 * worked it out" into "we know" is a human confirming or correcting it. That
 * is why facts are their own table with a `source` column rather than columns
 * on `parties`: a name heard over a phone line and a name a receptionist
 * verified are the same string with entirely different standing.
 *
 * Nothing here infers. A call produces exactly what a call can produce — a
 * number the carrier supplied, a language we spoke in, and a name if the
 * caller gave one — and the record says so.
 */

/** The one fact a phone call can produce today. */
export const NAME_FACT_LABEL = "Name";

/** Facts nobody has checked. The queue behind the directory's primary action. */
export const UNCONFIRMED_SOURCES = ["ai_inferred", "unverified"];

/**
 * Whether a caller ID is something we could recognise on the next call.
 *
 * Twilio spells a withheld number several ways — "anonymous", "restricted",
 * "unavailable", the literal +266696687 (ANONYMOUS on a keypad) — and the
 * `<Gather>` path substitutes "unknown" when the field is absent entirely.
 * None of those identify anybody, and a directory row keyed on one is not a
 * customer record, it is a duplicate waiting to happen.
 */
export function isIdentifiablePhone(phone: string | null | undefined): phone is string {
  if (!phone) return false;
  if (phone === "+266696687") return false;
  return /^\+[1-9]\d{6,14}$/.test(phone.trim());
}

export type RememberCallerInput = {
  workspaceId: string;
  /** The human end of the call, never the business's own number. */
  phone: string | null | undefined;
  /** What the caller said their name was, if they said. */
  name?: string | null;
  /** The language the call was actually conducted in. */
  language?: string | null;
  /** Linked to the party so the record's history has something in it. */
  conversationId?: string | null;
  /** When contact happened. Defaults to now. */
  at?: Date;
};

/**
 * Records that this person rang, and returns their directory id.
 *
 * The single entry point the telephony side uses. Idempotent on the caller's
 * number: the second call from a number updates the record the first one
 * created rather than making another. Returns null when the caller cannot be
 * identified, which is not a failure — it is the honest answer for a withheld
 * number, and the booking such a caller makes still carries the name and
 * number they gave.
 */
export async function rememberCaller(input: RememberCallerInput): Promise<string | null> {
  if (!isIdentifiablePhone(input.phone)) return null;

  const phone = input.phone.trim();
  const at = input.at ?? new Date();
  const name = normaliseName(input.name);

  const party = await prisma.party.upsert({
    where: { workspaceId_primaryPhone: { workspaceId: input.workspaceId, primaryPhone: phone } },
    create: {
      workspaceId: input.workspaceId,
      // Until somebody says a name, the number *is* the name. It is the only
      // true thing we can put at the top of the record.
      displayName: name ?? phone,
      primaryPhone: phone,
      preferredLanguage: input.language ?? null,
      lastContactAt: at,
    },
    update: { lastContactAt: at },
    select: { id: true },
  });

  if (name) await noteName(party.id, name);
  if (input.conversationId) await linkConversation(input.conversationId, party.id);

  return party.id;
}

/**
 * Writes the name the caller gave — unless a person has already settled it.
 *
 * Speech recognition mishears names constantly, which is the entire reason
 * this screen has a Confirm button. Once somebody has verified "Siobhan", the
 * next call hearing "Shevonne" must not quietly overwrite them; a human
 * decision outranks a transcription, permanently.
 */
async function noteName(partyId: string, name: string): Promise<void> {
  const existing = await prisma.partyFact.findUnique({
    where: { partyId_label: { partyId, label: NAME_FACT_LABEL } },
    select: { source: true, value: true },
  });

  if (existing?.source === "verified") return;
  if (existing?.value === name) return;

  await prisma.$transaction([
    prisma.partyFact.upsert({
      where: { partyId_label: { partyId, label: NAME_FACT_LABEL } },
      create: { partyId, label: NAME_FACT_LABEL, value: name, source: "ai_inferred" },
      update: { value: name, source: "ai_inferred", settledByUserId: null },
    }),
    // The header and the fact are the same claim, so they move together.
    prisma.party.update({ where: { id: partyId }, data: { displayName: name } }),
  ]);
}

async function linkConversation(conversationId: string, partyId: string): Promise<void> {
  await prisma.conversation.update({ where: { id: conversationId }, data: { partyId } });
}

function normaliseName(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

// ──────────────────────────────────────────────────────────────── reading

export type PartyFilters = {
  /** Matches name, number, email and both halves of any fact. */
  search?: string;
  /** Only people carrying something nobody has checked. */
  unconfirmedOnly?: boolean;
  limit?: number;
};

/** Facts always travel with the party — a record without them says nothing. */
const partyInclude = {
  facts: { orderBy: { label: "asc" } },
} satisfies Prisma.PartyInclude;

export async function listParties(workspaceId: string, filters: PartyFilters = {}) {
  const search = filters.search?.trim();

  return prisma.party.findMany({
    where: {
      workspaceId,
      ...(filters.unconfirmedOnly
        ? { facts: { some: { source: { in: UNCONFIRMED_SOURCES } } } }
        : {}),
      ...(search ? { OR: searchClauses(search) } : {}),
    },
    // Most recent contact first: the person who just rang is the person most
    // likely to be looked up.
    orderBy: [{ lastContactAt: "desc" }, { createdAt: "desc" }],
    take: Math.min(filters.limit ?? 100, 200),
    include: partyInclude,
  });
}

function searchClauses(search: string) {
  const insensitive = { contains: search, mode: "insensitive" as const };
  // A number is typed however the operator remembers it — spaces, brackets,
  // a leading zero — so only the digits are compared against what we stored.
  const digits = search.replace(/\D/g, "");

  return [
    { displayName: insensitive },
    { primaryEmail: insensitive },
    ...(digits.length >= 3 ? [{ primaryPhone: { contains: digits } }] : []),
    // Both halves of a fact: the label is the question somebody looking a
    // person up would type ("Name"), and the value is the answer.
    { facts: { some: { OR: [{ label: insensitive }, { value: insensitive }] } } },
  ];
}

export async function getParty(workspaceId: string, partyId: string) {
  return prisma.party.findFirst({ where: { id: partyId, workspaceId }, include: partyInclude });
}

// ──────────────────────────────────────────────────────────────── writing

/**
 * Confirming or correcting a fact — the directory's whole point.
 *
 * Both produce `verified`, and deliberately take no `source` argument: a
 * person settling a fact is the only route to verified, and letting a caller
 * name any provenance would make provenance meaningless. Correcting replaces
 * the value; confirming keeps it. Neither ever touches the booking that
 * quoted the old value — see `Record.partyId`.
 *
 * Returns null when the fact is not on a party in this workspace, so the
 * route can answer 404 without a second query.
 */
export async function settleFact(input: {
  workspaceId: string;
  partyId: string;
  label: string;
  /** Omitted when confirming the value already on the record. */
  value?: string;
  userId: string;
}) {
  const fact = await prisma.partyFact.findFirst({
    where: { partyId: input.partyId, label: input.label, party: { workspaceId: input.workspaceId } },
    select: { id: true, value: true },
  });
  if (!fact) return null;

  const value = input.value?.trim() || fact.value;

  await prisma.$transaction([
    prisma.partyFact.update({
      where: { id: fact.id },
      data: { value, source: "verified", settledByUserId: input.userId },
    }),
    // The name at the top of the record is the `Name` fact, so correcting one
    // renames the other. Anything else is just a fact.
    ...(input.label === NAME_FACT_LABEL
      ? [prisma.party.update({ where: { id: input.partyId }, data: { displayName: value } })]
      : []),
  ]);

  return getParty(input.workspaceId, input.partyId);
}
