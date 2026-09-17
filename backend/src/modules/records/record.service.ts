import type { Prisma } from "@prisma/client";
import { prisma } from "@/db/client.js";

/**
 * Records: the things an AI employee actually *did*, as opposed to said.
 *
 * This is the first write the employee makes to the business itself rather
 * than to its own transcript, so the shape is deliberately conservative — an
 * archetype, a type within it, and a schema-free field bag the frontend's
 * archetype layout renders. A hotel reservation and a clinic appointment are
 * the same row with different words around them, which is what keeps one
 * table serving every industry.
 */

export type CreateRecordInput = {
  workspaceId: string;
  conversationId: string | null;
  /** The directory record for whoever it is for, when the caller was recognisable. */
  partyId?: string | null;
  archetype: string;
  typeId: string;
  status?: string;
  partyName?: string | null;
  partyPhone?: string | null;
  scheduledAt?: Date | null;
  fields?: Prisma.InputJsonObject;
};

export async function createRecord(input: CreateRecordInput): Promise<string> {
  const record = await prisma.record.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      partyId: input.partyId ?? null,
      archetype: input.archetype,
      typeId: input.typeId,
      status: input.status ?? "confirmed",
      partyName: input.partyName ?? null,
      partyPhone: input.partyPhone ?? null,
      scheduledAt: input.scheduledAt ?? null,
      fieldsJson: input.fields ?? {},
    },
    select: { id: true },
  });

  return record.id;
}

export async function listRecords(
  workspaceId: string,
  options: { limit?: number; partyId?: string } = {},
) {
  const limit = options.limit ?? 100;
  return prisma.record.findMany({
    where: { workspaceId, ...(options.partyId ? { partyId: options.partyId } : {}) },
    orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
    take: Math.min(limit, 200),
    include: {
      conversation: {
        select: { id: true, callSession: { select: { fromNumber: true } } },
      },
    },
  });
}

/** Records produced by one call, for the conversation timeline. */
export async function listRecordsForConversation(conversationId: string) {
  return prisma.record.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });
}

// ──────────────────────────────────────────────── changing one that exists

/**
 * The type `create_booking` writes, and therefore the only type a caller may
 * change over the phone.
 *
 * Narrow on purpose. "Everything this caller's number is attached to" would
 * one day include a case or an order, and a caller saying "cancel it" must
 * never reach something a phone call did not create.
 */
export const BOOKING_TYPE_ID = "booking";

/** A booking still ahead of the caller: the only kind they can change. */
const LIVE_STATUSES = ["confirmed", "pending"];

export type CallerBooking = {
  id: string;
  status: string;
  partyName: string | null;
  scheduledAt: Date | null;
  fields: Prisma.JsonValue;
};

/**
 * What this caller already has booked, soonest first.
 *
 * Keyed on the number the booking was taken under rather than on `partyId`,
 * because the number is what we can prove at the moment the phone rings — a
 * booking whose directory link failed is still that caller's booking, and a
 * withheld number resolves to nothing here, which is the honest answer.
 *
 * Past bookings are excluded rather than shown as history: this list exists so
 * a caller can change something, and offering to cancel last Tuesday is noise.
 */
export async function listUpcomingBookingsForPhone(
  workspaceId: string,
  phone: string,
  options: { now?: Date; limit?: number } = {},
): Promise<CallerBooking[]> {
  const records = await prisma.record.findMany({
    where: {
      workspaceId,
      partyPhone: phone,
      typeId: BOOKING_TYPE_ID,
      status: { in: LIVE_STATUSES },
      scheduledAt: { gte: options.now ?? new Date() },
    },
    orderBy: { scheduledAt: "asc" },
    take: options.limit ?? 10,
    select: { id: true, status: true, partyName: true, scheduledAt: true, fieldsJson: true },
  });

  return records.map((r) => ({
    id: r.id,
    status: r.status,
    partyName: r.partyName,
    scheduledAt: r.scheduledAt,
    fields: r.fieldsJson,
  }));
}

/**
 * Moves a booking rather than replacing it.
 *
 * The row keeps its id, its link to the call that created it and its place in
 * the caller's history, and gains a note of where it moved from. Cancelling
 * and re-booking would leave the business two entries for one table — which
 * is exactly the failure this exists to prevent.
 *
 * Scoped by workspace in the `where` and not merely checked afterwards, so a
 * booking id belonging to another tenant updates nothing.
 */
export async function rescheduleRecord(input: {
  workspaceId: string;
  recordId: string;
  scheduledAt: Date;
  by?: string;
}): Promise<boolean> {
  const existing = await prisma.record.findFirst({
    where: { id: input.recordId, workspaceId: input.workspaceId },
    select: { scheduledAt: true, fieldsJson: true },
  });
  if (!existing) return false;

  const result = await prisma.record.updateMany({
    where: { id: input.recordId, workspaceId: input.workspaceId },
    data: {
      // Status is deliberately untouched: moving a booking that staff have not
      // confirmed yet does not confirm it.
      scheduledAt: input.scheduledAt,
      fieldsJson: {
        ...asFields(existing.fieldsJson),
        ...(existing.scheduledAt ? { rescheduledFrom: existing.scheduledAt.toISOString() } : {}),
        rescheduledBy: input.by ?? "ai_employee",
      },
    },
  });

  return result.count > 0;
}

/**
 * Cancels a booking, keeping the row.
 *
 * A deleted booking is indistinguishable from one that never happened, and the
 * business needs to see that the table it was holding is free again — and why.
 */
export async function cancelRecord(input: {
  workspaceId: string;
  recordId: string;
  reason?: string | null;
  by?: string;
}): Promise<boolean> {
  const existing = await prisma.record.findFirst({
    where: { id: input.recordId, workspaceId: input.workspaceId },
    select: { fieldsJson: true },
  });
  if (!existing) return false;

  const result = await prisma.record.updateMany({
    where: { id: input.recordId, workspaceId: input.workspaceId },
    data: {
      status: "cancelled",
      fieldsJson: {
        ...asFields(existing.fieldsJson),
        cancelledAt: new Date().toISOString(),
        cancelledBy: input.by ?? "ai_employee",
        ...(input.reason ? { cancellationReason: input.reason } : {}),
      },
    },
  });

  return result.count > 0;
}

/** The field bag as an object — anything else stored there is discarded, not spread. */
function asFields(raw: Prisma.JsonValue): Prisma.InputJsonObject {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}
