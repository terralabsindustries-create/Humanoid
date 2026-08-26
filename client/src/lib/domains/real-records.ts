import type { DomainRecord, RecordArchetype } from "@/lib/domain/types";
import type { RecordFilters } from "@/lib/services/contract";
import * as api from "@/lib/services/http/records";

/**
 * Real records — things a real AI employee actually did on a real call —
 * mapped onto the same `DomainRecord` the Northgate fixtures use.
 *
 * The counterpart to `real-conversations.ts`, and the same rule applies: what
 * the backend cannot yet produce comes back as an honest empty value rather
 * than borrowed from the demo tenant. A real booking now points at a real
 * person — the caller's own directory record — but still has no resource
 * assigned, because there is no room or table inventory to assign from, so
 * `resourceId` stays null. `partyId` is null for a withheld number, which is
 * a caller the directory deliberately cannot recognise; the name and number
 * they gave stay on the booking either way — and `partyName` is that name,
 * carried separately from the directory record so a later correction there
 * cannot rewrite a booking staff have already acted on.
 */

const ARCHETYPES: RecordArchetype[] = ["visit", "case", "lead", "order", "party", "resource"];

function archetypeOf(raw: string): RecordArchetype {
  return (ARCHETYPES as string[]).includes(raw) ? (raw as RecordArchetype) : "visit";
}

/** `fields` renders as text; anything the backend stored is coerced, not dropped. */
function toFields(raw: Record<string, unknown>): DomainRecord["fields"] {
  const fields: DomainRecord["fields"] = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      fields[key] = value;
    } else {
      fields[key] = JSON.stringify(value);
    }
  }
  return fields;
}

function mapRecord(r: api.ApiRecord, locationId: string): DomainRecord {
  return {
    id: r.id,
    archetype: archetypeOf(r.archetype),
    typeId: r.typeId,
    locationId,
    partyId: r.partyId,
    // The name the booking was actually taken under, kept off the directory
    // record on purpose: the same phone ringing back as somebody else renames
    // the party, and Thursday's booking still belongs to whoever made it.
    partyName: r.partyName,
    status: r.status,
    fields: {
      ...(r.partyPhone ? { phone: r.partyPhone } : {}),
      ...toFields(r.fields),
    },
    scheduledAt: r.scheduledAt,
    resourceId: null,
    createdByConversationId: r.createdByConversationId,
    createdAt: r.createdAt,
  };
}

export async function listRealRecords(
  workspaceId: string,
  locationId: string,
  filters: RecordFilters,
): Promise<DomainRecord[]> {
  // `partyId` is applied by the backend so one person's history is complete
  // rather than whatever survives a page of the whole workspace's diary.
  const raw = await api.listRecords(workspaceId, { partyId: filters.partyId });
  let list = raw.map((r) => mapRecord(r, locationId));

  if (filters.archetype?.length) list = list.filter((r) => filters.archetype!.includes(r.archetype));
  if (filters.status?.length) list = list.filter((r) => filters.status!.includes(r.status));
  // Every real record was created by a call, so this filter is a no-op today
  // rather than a lie — it will matter the moment anything else writes one.
  if (filters.createdByAiOnly) list = list.filter((r) => r.createdByConversationId !== null);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(
      (r) =>
        r.typeId.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        Object.values(r.fields).some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }

  return list;
}
