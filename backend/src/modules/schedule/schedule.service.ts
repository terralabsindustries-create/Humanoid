import { prisma } from "@/db/client.js";
import { BOOKING_TYPE_ID } from "@/modules/records/record.service.js";
import { recordAudit } from "@/lib/audit.js";

/**
 * Whether the business is open, and whether the slot has room.
 *
 * This is the answer `create_booking` never had. Until now the employee wrote
 * whatever date and time the caller said: three in the morning at a clinic
 * that opens at eight, or the twentieth table at a restaurant that seats
 * twelve. Both were spoken back as confirmed and both landed in the diary
 * looking like a good booking, which is why the failure was invisible until
 * somebody turned up at a locked door.
 *
 * The rule the whole module is built on, and the one to keep straight before
 * changing anything here:
 *
 * **An unconfigured schedule is not a closed business.** Every workspace that
 * exists today has no hours and no policy. If "no rows" meant "shut", this
 * module would take every tenant's phone line down the moment it shipped —
 * the same failure mode `shouldAnswerCall()` fails open to avoid. So each of
 * the three checks is independently skippable, and a workspace is told which
 * ones actually ran (`checked`) rather than being handed a verdict that
 * silently rested on nothing.
 *
 * The second rule follows from the first: **an unchecked slot is never
 * reported as a free one.** "I cannot see the diary" and "that time is
 * available" are different sentences, and the employee is given whichever one
 * is true. Collapsing them would turn a missing configuration into a promise
 * the business has to honour.
 */

// ───────────────────────────────────────────────────────────────── the shape

export type BusinessPeriod = { dayOfWeek: number; opensMinute: number; closesMinute: number };

export type ScheduleExceptionInput = {
  date: string;
  closed: boolean;
  opensMinute?: number | null;
  closesMinute?: number | null;
  reason?: string | null;
};

export type BookingPolicySettings = {
  slotMinutes: number;
  durationMinutes: number;
  capacityPerSlot: number | null;
  leadTimeMinutes: number;
  maxAdvanceDays: number;
};

export const DEFAULT_POLICY: BookingPolicySettings = {
  slotMinutes: 30,
  durationMinutes: 30,
  capacityPerSlot: null,
  leadTimeMinutes: 0,
  maxAdvanceDays: 180,
};

export type Schedule = {
  timezone: string;
  /** Empty means opening hours are not configured, not that the week is shut. */
  periods: BusinessPeriod[];
  exceptions: ScheduleExceptionInput[];
  policy: BookingPolicySettings;
  /** False when no policy row exists — `policy` above is then only defaults. */
  policyConfigured: boolean;
};

/** Which of the three gates actually had something to check against. */
export type ChecksRun = { hours: boolean; capacity: boolean; horizon: boolean };

export type AvailabilityVerdict =
  | { status: "open"; checked: ChecksRun }
  /** Outside opening hours, or on a date the business closed. */
  | { status: "closed"; checked: ChecksRun; reason: string; alternatives: Date[] }
  /** Open, but the slot already holds as many bookings as it may. */
  | { status: "full"; checked: ChecksRun; reason: string; alternatives: Date[] }
  /** Too soon, or further ahead than the diary goes. */
  | { status: "out_of_range"; checked: ChecksRun; reason: string; alternatives: Date[] }
  /** Nothing was configured to check against. Never "open". */
  | { status: "unchecked"; checked: ChecksRun };

// ──────────────────────────────────────────────────────────────────── loading

export async function getSchedule(workspaceId: string): Promise<Schedule | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      timezone: true,
      businessHours: { orderBy: [{ dayOfWeek: "asc" }, { opensMinute: "asc" }] },
      scheduleExceptions: { orderBy: { date: "asc" } },
      bookingPolicy: true,
    },
  });
  if (!workspace) return null;

  return {
    timezone: workspace.timezone,
    periods: workspace.businessHours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      opensMinute: h.opensMinute,
      closesMinute: h.closesMinute,
    })),
    exceptions: workspace.scheduleExceptions.map((e) => ({
      date: e.date,
      closed: e.closed,
      opensMinute: e.opensMinute,
      closesMinute: e.closesMinute,
      reason: e.reason,
    })),
    policy: workspace.bookingPolicy
      ? {
          slotMinutes: workspace.bookingPolicy.slotMinutes,
          durationMinutes: workspace.bookingPolicy.durationMinutes,
          capacityPerSlot: workspace.bookingPolicy.capacityPerSlot,
          leadTimeMinutes: workspace.bookingPolicy.leadTimeMinutes,
          maxAdvanceDays: workspace.bookingPolicy.maxAdvanceDays,
        }
      : DEFAULT_POLICY,
    policyConfigured: workspace.bookingPolicy !== null,
  };
}

/** True when this workspace has told us anything at all about its week. */
export function hasOpeningHours(schedule: Schedule | null): boolean {
  return (schedule?.periods.length ?? 0) > 0;
}

/** True when capacity is a number somebody chose, rather than an absence. */
export function hasCapacity(schedule: Schedule | null): boolean {
  return schedule?.policy.capacityPerSlot != null;
}

// ────────────────────────────────────────────────────────── timezone plumbing
//
// The same problem `booking-tool.ts` solves for writes, needed here for reads:
// Node formats into any IANA zone but parses in none, so a wall clock in the
// business's zone has to be recovered by formatting an instant and reading the
// fields back. Kept separate rather than imported across, because the booking
// tool is a caller of this module and the dependency must not run both ways.

type LocalClock = { date: string; dayOfWeek: number; minute: number };

/** An instant, as the wall clock and weekday the business would recognise. */
export function localClock(instant: Date, timeZone: string): LocalClock {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(instant);

    const field = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return {
      date: `${field("year")}-${field("month")}-${field("day")}`,
      dayOfWeek: Math.max(0, weekdays.indexOf(field("weekday"))),
      minute: Number(field("hour")) * 60 + Number(field("minute")),
    };
  } catch {
    // An unrecognised zone. UTC is wrong, but wrong identically everywhere,
    // where the process clock would be wrong differently on every machine.
    return {
      date: instant.toISOString().slice(0, 10),
      dayOfWeek: instant.getUTCDay(),
      minute: instant.getUTCHours() * 60 + instant.getUTCMinutes(),
    };
  }
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const field = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? "0");

  return (
    Date.UTC(
      field("year"),
      field("month") - 1,
      field("day"),
      field("hour"),
      field("minute"),
      field("second"),
    ) - instant.getTime()
  );
}

/** A local date plus minutes-from-midnight, back to the instant it names. */
export function instantAt(date: string, minute: number, timeZone: string): Date {
  const wallClock = new Date(`${date}T00:00:00Z`).getTime() + minute * 60_000;
  try {
    // One correction step, so a slot either side of a DST change lands on the
    // clock time the business actually keeps.
    const guess = new Date(wallClock - zoneOffsetMs(new Date(wallClock), timeZone));
    return new Date(wallClock - zoneOffsetMs(guess, timeZone));
  } catch {
    return new Date(wallClock);
  }
}

/** `2026-09-04` plus n days, staying a calendar date rather than an instant. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ──────────────────────────────────────────────────────────── opening periods

/**
 * The periods the business is open on one local date.
 *
 * An exception for the date replaces the weekly pattern outright rather than
 * merging with it: a bank holiday closure and "we open late on the 24th" are
 * both statements about that whole day, and merging would leave the regular
 * morning shift open on a day the business said it was shut.
 *
 * Returns null — distinct from an empty array — when nothing is configured, so
 * the caller can tell "closed" from "not known".
 */
export function periodsOn(
  schedule: Schedule,
  date: string,
): { opensMinute: number; closesMinute: number }[] | null {
  if (!hasOpeningHours(schedule)) return null;

  const exception = schedule.exceptions.find((e) => e.date === date);
  if (exception) {
    if (exception.closed) return [];
    // `closed: false` with no hours says nothing usable. Falling through to
    // the weekly pattern is the honest reading — the row records that the day
    // is *not* shut, and nothing more.
    if (exception.opensMinute != null && exception.closesMinute != null) {
      return [{ opensMinute: exception.opensMinute, closesMinute: exception.closesMinute }];
    }
  }

  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
  return schedule.periods
    .filter((p) => p.dayOfWeek === dayOfWeek)
    .map((p) => ({ opensMinute: p.opensMinute, closesMinute: p.closesMinute }));
}

/**
 * Whether one instant falls inside an opening period.
 *
 * The *whole booking* has to fit, not just its start: a 60-minute appointment
 * beginning ten minutes before closing is not a booking the business can
 * honour, and accepting it is the same class of error as booking at 3am.
 */
function isOpenAt(schedule: Schedule, at: Date): boolean | null {
  const clock = localClock(at, schedule.timezone);
  const periods = periodsOn(schedule, clock.date);
  if (periods === null) return null;

  const ends = clock.minute + schedule.policy.durationMinutes;
  return periods.some((p) => clock.minute >= p.opensMinute && ends <= p.closesMinute);
}

/** Why a time is outside opening hours, worded for the caller. */
function closedReason(schedule: Schedule, at: Date): string {
  const clock = localClock(at, schedule.timezone);
  const exception = schedule.exceptions.find((e) => e.date === clock.date);
  if (exception?.closed) {
    return exception.reason
      ? `the business is closed that day for ${exception.reason}`
      : "the business is closed that day";
  }

  const periods = periodsOn(schedule, clock.date) ?? [];
  if (periods.length === 0) return "the business is not open that day";

  const spans = periods.map((p) => `${spokenMinute(p.opensMinute)} to ${spokenMinute(p.closesMinute)}`);
  return `that day the business is only open ${spans.join(" and ")}`;
}

/** 540 → "nine o'clock"; 1035 → "five fifteen". Written to be read aloud. */
export function spokenMinute(minute: number): string {
  const hour24 = Math.floor(minute / 60) % 24;
  const mins = minute % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const suffix = hour24 < 12 ? "in the morning" : hour24 < 18 ? "in the afternoon" : "in the evening";
  if (mins === 0) return `${hour12} o'clock ${suffix}`;
  return `${hour12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

// ───────────────────────────────────────────────────────────────── capacity

/**
 * How many live bookings overlap a slot.
 *
 * Overlap, not equality: a 60-minute booking at 09:30 occupies 10:00 on a
 * single chair, and counting only exact start times would let the business be
 * double-booked by callers who simply asked for a different half hour.
 *
 * Cancelled bookings do not count — that is the whole point of keeping the
 * row rather than deleting it.
 */
async function countOverlapping(
  workspaceId: string,
  at: Date,
  durationMinutes: number,
  ignoreRecordId?: string,
): Promise<number> {
  const durationMs = durationMinutes * 60_000;

  return prisma.record.count({
    where: {
      workspaceId,
      typeId: BOOKING_TYPE_ID,
      status: { in: ["confirmed", "pending"] },
      ...(ignoreRecordId ? { id: { not: ignoreRecordId } } : {}),
      // Two windows of equal length overlap exactly when their starts are
      // less than one duration apart, in either direction.
      scheduledAt: {
        gt: new Date(at.getTime() - durationMs),
        lt: new Date(at.getTime() + durationMs),
      },
    },
  });
}

// ────────────────────────────────────────────────────────────── the verdict

export type AvailabilityQuery = {
  workspaceId: string;
  at: Date;
  now?: Date;
  /** A booking being moved does not collide with itself. */
  ignoreRecordId?: string;
  /** Pre-loaded schedule, when the caller already has one. */
  schedule?: Schedule | null;
};

/**
 * The one question every write asks first.
 *
 * Order matters. Horizon before hours before capacity, so the caller is told
 * the most fundamental reason rather than the first one a different order
 * happened to hit — "we do not book that far ahead" is a better answer than
 * "we are shut on that Sunday" when both are true.
 */
export async function checkAvailability(query: AvailabilityQuery): Promise<AvailabilityVerdict> {
  const schedule = query.schedule !== undefined ? query.schedule : await getSchedule(query.workspaceId);
  const now = query.now ?? new Date();

  const checked: ChecksRun = {
    hours: hasOpeningHours(schedule),
    capacity: hasCapacity(schedule),
    horizon: schedule?.policyConfigured ?? false,
  };

  if (!schedule || (!checked.hours && !checked.capacity && !checked.horizon)) {
    return { status: "unchecked", checked };
  }

  // ── how far ahead, and how soon
  if (checked.horizon) {
    const minutesAway = (query.at.getTime() - now.getTime()) / 60_000;
    if (minutesAway < schedule.policy.leadTimeMinutes) {
      const reason =
        minutesAway < 0
          ? "that time has already passed"
          : `the business needs at least ${describeLead(schedule.policy.leadTimeMinutes)} notice`;
      return {
        status: "out_of_range",
        checked,
        reason,
        alternatives: await suggestSlots({ ...query, schedule, now, from: earliestBookable(schedule, now) }),
      };
    }

    const daysAway = minutesAway / (60 * 24);
    if (daysAway > schedule.policy.maxAdvanceDays) {
      return {
        status: "out_of_range",
        checked,
        reason: `the diary is only open ${schedule.policy.maxAdvanceDays} days ahead`,
        alternatives: [],
      };
    }
  }

  // ── open at all
  if (checked.hours) {
    const open = isOpenAt(schedule, query.at);
    if (open === false) {
      return {
        status: "closed",
        checked,
        reason: closedReason(schedule, query.at),
        alternatives: await suggestSlots({ ...query, schedule, now }),
      };
    }
  }

  // ── room in the slot
  if (checked.capacity) {
    const taken = await countOverlapping(
      query.workspaceId,
      query.at,
      schedule.policy.durationMinutes,
      query.ignoreRecordId,
    );
    if (taken >= schedule.policy.capacityPerSlot!) {
      return {
        status: "full",
        checked,
        reason: "that time is fully booked",
        alternatives: await suggestSlots({ ...query, schedule, now }),
      };
    }
  }

  return { status: "open", checked };
}

function describeLead(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${Math.round(hours / 24)} days`;
}

function earliestBookable(schedule: Schedule, now: Date): Date {
  return new Date(now.getTime() + schedule.policy.leadTimeMinutes * 60_000);
}

// ────────────────────────────────────────────────────────────── alternatives

export type SuggestQuery = {
  workspaceId: string;
  at: Date;
  now?: Date;
  from?: Date;
  ignoreRecordId?: string;
  schedule?: Schedule | null;
  limit?: number;
  /** How many local days ahead to look before giving up. */
  horizonDays?: number;
};

/**
 * The nearest times that are actually bookable, closest to what they asked for
 * first.
 *
 * A refusal without alternatives is what the employee could already do: "we
 * cannot do that" and the caller hangs up. The whole value of knowing the
 * diary is being able to finish the sentence — so every non-open verdict
 * carries the times that *are* free, and the model is told to offer them.
 *
 * Deliberately capped and deliberately near. Three options a caller can hold
 * in their head beats twenty read down a phone line, and searching a week
 * ahead for a Tuesday lunch nobody asked about is not helpfulness.
 */
export async function suggestSlots(query: SuggestQuery): Promise<Date[]> {
  const schedule = query.schedule !== undefined ? query.schedule : await getSchedule(query.workspaceId);
  if (!schedule || !hasOpeningHours(schedule)) return [];

  const now = query.now ?? new Date();
  const notBefore = Math.max(
    (query.from ?? earliestBookable(schedule, now)).getTime(),
    earliestBookable(schedule, now).getTime(),
  );
  const limit = query.limit ?? 3;
  const horizonDays = query.horizonDays ?? 7;
  const { slotMinutes, durationMinutes } = schedule.policy;

  const wanted = localClock(query.at, schedule.timezone);
  const candidates: Date[] = [];

  for (let offset = 0; offset <= horizonDays && candidates.length < limit * 4; offset += 1) {
    const date = addDays(wanted.date, offset);
    const periods = periodsOn(schedule, date) ?? [];

    for (const period of periods) {
      // Aligned to the grain the business offers, so the employee never says
      // "twenty past four" to a practice that books on the half hour.
      const first = Math.ceil(period.opensMinute / slotMinutes) * slotMinutes;
      for (let minute = first; minute + durationMinutes <= period.closesMinute; minute += slotMinutes) {
        const instant = instantAt(date, minute, schedule.timezone);
        if (instant.getTime() < notBefore) continue;
        if (instant.getTime() === query.at.getTime()) continue;
        candidates.push(instant);
      }
    }
  }

  // Nearest to what they asked for, in either direction — a caller who wanted
  // seven o'clock is better served by half past six than by next Tuesday.
  candidates.sort(
    (a, b) => Math.abs(a.getTime() - query.at.getTime()) - Math.abs(b.getTime() - query.at.getTime()),
  );

  if (!hasCapacity(schedule)) return candidates.slice(0, limit);

  // Only the ones that still have room. Checked in order and stopped early,
  // because this runs on a caller's turn budget with the line open.
  const free: Date[] = [];
  for (const candidate of candidates) {
    if (free.length >= limit) break;
    const taken = await countOverlapping(
      query.workspaceId,
      candidate,
      durationMinutes,
      query.ignoreRecordId,
    );
    if (taken < schedule.policy.capacityPerSlot!) free.push(candidate);
  }
  return free;
}

// ────────────────────────────────────────────────────────────────── writing

export type ScheduleInput = {
  periods?: BusinessPeriod[];
  exceptions?: ScheduleExceptionInput[];
  policy?: Partial<BookingPolicySettings>;
  /** Who changed it, for the audit row. Absent for a script or a seed. */
  actorUserId?: string | null;
};

/**
 * Replaces the schedule wholesale, in one transaction.
 *
 * A weekly pattern is edited as a whole — somebody deleting Saturday and
 * adding a Sunday means the week they left behind, not a merge of two states.
 * Partial policy updates *are* merged, because the policy is a set of
 * independent settings rather than one shape.
 */
export async function setSchedule(workspaceId: string, input: ScheduleInput): Promise<Schedule | null> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
  if (!workspace) return null;

  // Read before the write, so the audit row says what actually changed rather
  // than only what it was set to. Opening hours are the setting most likely to
  // be argued about afterwards — a caller turned away at six because somebody
  // moved closing time and nobody remembers doing it.
  const before = await getSchedule(workspaceId);

  await prisma.$transaction(async (tx) => {
    if (input.periods) {
      await tx.businessHours.deleteMany({ where: { workspaceId } });
      if (input.periods.length > 0) {
        await tx.businessHours.createMany({
          data: input.periods.map((p) => ({
            workspaceId,
            dayOfWeek: p.dayOfWeek,
            opensMinute: p.opensMinute,
            closesMinute: p.closesMinute,
          })),
        });
      }
    }

    if (input.exceptions) {
      await tx.scheduleException.deleteMany({ where: { workspaceId } });
      if (input.exceptions.length > 0) {
        await tx.scheduleException.createMany({
          data: input.exceptions.map((e) => ({
            workspaceId,
            date: e.date,
            closed: e.closed,
            opensMinute: e.opensMinute ?? null,
            closesMinute: e.closesMinute ?? null,
            reason: e.reason ?? null,
          })),
        });
      }
    }

    if (input.policy) {
      const existing = await tx.bookingPolicy.findUnique({ where: { workspaceId } });
      const merged = { ...DEFAULT_POLICY, ...(existing ?? {}), ...input.policy };
      await tx.bookingPolicy.upsert({
        where: { workspaceId },
        create: {
          workspaceId,
          slotMinutes: merged.slotMinutes,
          durationMinutes: merged.durationMinutes,
          capacityPerSlot: merged.capacityPerSlot,
          leadTimeMinutes: merged.leadTimeMinutes,
          maxAdvanceDays: merged.maxAdvanceDays,
        },
        update: {
          slotMinutes: merged.slotMinutes,
          durationMinutes: merged.durationMinutes,
          capacityPerSlot: merged.capacityPerSlot,
          leadTimeMinutes: merged.leadTimeMinutes,
          maxAdvanceDays: merged.maxAdvanceDays,
        },
      });
    }
  });

  const after = await getSchedule(workspaceId);

  await recordAudit({
    workspaceId,
    actorType: input.actorUserId ? "user" : "system",
    actorId: input.actorUserId ?? null,
    action: "channel.schedule_changed",
    resourceType: "workspace",
    resourceId: workspaceId,
    metadata: {
      before: before && { periods: before.periods, exceptions: before.exceptions, policy: before.policy },
      after: after && { periods: after.periods, exceptions: after.exceptions, policy: after.policy },
    },
  });

  return after;
}

// ─────────────────────────────────────────────────────────── for the prompt

/**
 * What the employee is allowed to believe about the diary, decided once when
 * the call connects rather than per turn.
 *
 * The system prompt is rebuilt on every turn and must stay synchronous — a
 * database round trip per turn is dead air on a live call — so this is loaded
 * with the employee and carried on it. It is also the reason both transports
 * cannot drift: `buildSystemPrompt` reads this one field, so the `<Gather>`
 * loop and the realtime relay say the same thing about opening hours.
 */
export type ScheduleAwareness = {
  hasHours: boolean;
  hasCapacity: boolean;
  /** The weekly pattern as sentences, already in the business's own words. */
  openingLines: string[];
  /** Dates the business has said are different, soonest first. */
  exceptionLines: string[];
};

export const NO_SCHEDULE_AWARENESS: ScheduleAwareness = {
  hasHours: false,
  hasCapacity: false,
  openingLines: [],
  exceptionLines: [],
};

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function describeSchedule(
  periods: BusinessPeriod[],
  exceptions: ScheduleExceptionInput[],
  capacityPerSlot: number | null,
): ScheduleAwareness {
  if (periods.length === 0 && capacityPerSlot == null) return NO_SCHEDULE_AWARENESS;

  const byWeekday = new Map<number, BusinessPeriod[]>();
  for (const period of periods) {
    byWeekday.set(period.dayOfWeek, [...(byWeekday.get(period.dayOfWeek) ?? []), period]);
  }

  const openingLines = WEEKDAY_NAMES.map((name, dayOfWeek) => {
    const day = (byWeekday.get(dayOfWeek) ?? []).sort((a, b) => a.opensMinute - b.opensMinute);
    // A closed day is stated rather than omitted. A model given five open days
    // and silence about the other two will guess, and it guesses open.
    if (day.length === 0) return `${name}: closed`;
    return `${name}: ${day
      .map((p) => `${spokenMinute(p.opensMinute)} to ${spokenMinute(p.closesMinute)}`)
      .join(", and again ")}`;
  });

  const exceptionLines = exceptions
    .slice(0, 10)
    .map((e) =>
      e.closed
        ? `${e.date}: closed${e.reason ? ` (${e.reason})` : ""}`
        : e.opensMinute != null && e.closesMinute != null
          ? `${e.date}: ${spokenMinute(e.opensMinute)} to ${spokenMinute(e.closesMinute)}${
              e.reason ? ` (${e.reason})` : ""
            }`
          : `${e.date}: open as usual${e.reason ? ` (${e.reason})` : ""}`,
    );

  return {
    hasHours: periods.length > 0,
    hasCapacity: capacityPerSlot != null,
    openingLines: periods.length > 0 ? openingLines : [],
    exceptionLines,
  };
}

/** Today's local calendar date in the workspace's zone, for filtering exceptions. */
export function todayLocalDate(timeZone: string, now = new Date()): string {
  return localClock(now, timeZone).date;
}
