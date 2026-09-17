import type { FactSource, Party, PartyFact } from "@/lib/domain/types";
import type { PartyFilters } from "@/lib/services/contract";
import * as api from "@/lib/services/http/parties";
import { HttpError } from "@/lib/services/http/client";

/**
 * Real people — the ones a real AI employee has actually spoken to — mapped
 * onto the same `Party` the Northgate fixtures use.
 *
 * The third surface to decide mock vs. real per request, after conversations
 * and records, and the same rule holds: what the backend cannot yet produce
 * comes back as an honest empty value rather than borrowed from the demo
 * tenant. A real caller has one fact behind them — the name they gave, which
 * reached us through speech recognition and which nobody has checked — and
 * that is exactly what this screen exists to have somebody check.
 *
 * Consent is the deliberate blank. Calls are not recorded and nothing asks
 * about marketing, so both answers are `unknown` — which the screen already
 * words as "never asked, treated as declined until it is". Storing a consent
 * column nothing ever writes would make an unasked question look like an
 * answered one.
 */

const FACT_SOURCES: FactSource[] = ["verified", "imported", "ai_inferred", "unverified"];

/** An unrecognised provenance is treated as unchecked, never as verified. */
function sourceOf(raw: string): FactSource {
  return (FACT_SOURCES as string[]).includes(raw) ? (raw as FactSource) : "unverified";
}

function mapFact(fact: api.ApiPartyFact): PartyFact {
  return {
    label: fact.label,
    value: fact.value,
    source: sourceOf(fact.source),
    updatedAt: fact.updatedAt,
  };
}

function mapParty(party: api.ApiParty, locationId: string): Party {
  return {
    id: party.id,
    displayName: party.displayName,
    phone: party.phone,
    email: party.email,
    // The workspace's own default, which is the language the call was
    // conducted in — there is no per-person language preference to read yet.
    preferredLanguage: party.preferredLanguage ?? "en-GB",
    // A real workspace has exactly one location today, so everyone belongs to
    // it. This is an index, not a claim about the person: it is what lets the
    // scope selector filter this directory the way it filters everything else.
    homeLocationId: locationId,
    facts: party.facts.map(mapFact),
    consent: { recording: "unknown", marketing: "unknown", updatedAt: null },
    createdAt: party.createdAt,
    lastContactAt: party.lastContactAt,
  };
}

/**
 * Search and the unconfirmed filter are applied by the backend rather than
 * here: a fact search has to reach into a table this side never loads, and a
 * directory is the one list that has a real reason to grow past a page.
 */
export async function listRealParties(
  workspaceId: string,
  locationId: string,
  filters: PartyFilters,
): Promise<Party[]> {
  const raw = await api.listParties(workspaceId, {
    search: filters.search,
    unconfirmedOnly: filters.unconfirmedOnly,
    limit: filters.limit,
  });

  return raw.map((party) => mapParty(party, locationId));
}

export async function getRealParty(
  workspaceId: string,
  locationId: string,
  partyId: string,
): Promise<Party | null> {
  try {
    return mapParty(await api.getParty(workspaceId, partyId), locationId);
  } catch (error) {
    if (error instanceof HttpError && (error.status === 404 || error.status === 403)) return null;
    throw error;
  }
}

export async function confirmRealPartyFact(
  workspaceId: string,
  locationId: string,
  partyId: string,
  label: string,
): Promise<Party> {
  return mapParty(await api.confirmPartyFact(workspaceId, partyId, label), locationId);
}

export async function correctRealPartyFact(
  workspaceId: string,
  locationId: string,
  partyId: string,
  label: string,
  value: string,
): Promise<Party> {
  return mapParty(await api.correctPartyFact(workspaceId, partyId, label, value), locationId);
}
