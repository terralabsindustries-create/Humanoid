/**
 * The words a phone call is made of: turning what a caller said into an
 * instant, and an instant back into something a speech synthesiser can read.
 *
 * Shared rather than duplicated because two tools now depend on agreeing
 * exactly. `check_availability` tells a caller half past six is free and
 * `create_booking` writes what they then ask for — if those two resolved a
 * wall clock differently, even by an hour across a DST boundary, the employee
 * would offer one time and book another, and the transcript would read as a
 * perfectly good call.
 *
 * The rule underneath all of it: a caller who says "eleven at night" means
 * eleven at night *where the business is*. Node can format into any IANA zone
 * but cannot parse a wall clock as one, so every conversion here recovers the
 * offset by formatting an instant into the zone and reading the fields back.
 */

/**
 * How far ahead of UTC `timeZone` is at a given instant, in milliseconds.
 *
 * Node can *format* into any IANA zone but cannot parse a wall clock as one,
 * so the offset has to be recovered by formatting an instant into the zone and
 * reading the fields back.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    // Not `hour12: false`, which yields hour "24" for midnight in some
    // engines and would push the date a day forward.
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const field = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? "0");

  const wallClock = Date.UTC(
    field("year"),
    field("month") - 1,
    field("day"),
    field("hour"),
    field("minute"),
    field("second"),
  );

  return wallClock - instant.getTime();
}

/**
 * Combines a plain date and time into an instant, read as a wall clock **in
 * the business's timezone**.
 *
 * A caller who says "eleven at night" means eleven at night where the business
 * is. `new Date("2026-08-26T23:00:00")` — an ISO string carrying no offset —
 * is defined by the language to mean local time *of this Node process*, so the
 * booking silently landed wherever the server happened to be running. On a
 * laptop in Asia/Kolkata a 23:00 booking for a Europe/London business was
 * stored as 17:30Z and shown back to staff as 18:30: five and a half hours
 * early, confirmed aloud to the caller as eleven, and wrong in a different
 * direction on every machine that ran it.
 *
 * The prompt already tells the model what day it is in the tenant's zone, so
 * this is the other half of that same contract — the model reasons in the
 * business's calendar, and the write has to resolve in the business's clock.
 *
 * Returns null rather than guessing when either part is unusable — a booking
 * whose time we invented is worse than one the business has to phone about,
 * and the spoken confirmation repeats what the caller actually said either way.
 */
export function toScheduledAt(date: unknown, time: unknown, timeZone: string): Date | null {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const clock = typeof time === "string" && /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : "00:00";

  // Parsed as UTC purely to validate the fields and get the wall clock as a
  // number; `Z` makes it strict, so "25:00" is rejected here rather than
  // silently rolling over.
  const wallClock = new Date(`${date}T${clock}:00Z`);
  if (Number.isNaN(wallClock.getTime())) return null;

  try {
    // The offset depends on the instant, and the instant is what we are
    // solving for. One correction step settles it: guess using the offset at
    // the wall clock read as UTC, then re-read the offset at that guess. This
    // is what makes a booking either side of a DST change land on the clock
    // time the caller actually said.
    const guess = new Date(wallClock.getTime() - zoneOffsetMs(wallClock, timeZone));
    return new Date(wallClock.getTime() - zoneOffsetMs(guess, timeZone));
  } catch {
    // An unknown IANA zone. UTC is wrong, but it is wrong *identically*
    // everywhere, where falling back to the process clock would reintroduce
    // exactly the bug above and hide it on whichever machine happened to
    // share the tenant's offset.
    console.error(
      `[VOICE] booking timezone "${timeZone}" is not a recognised IANA zone — storing the time as UTC`,
    );
    return wallClock;
  }
}

export function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * A stored instant read back as the wall clock the caller would recognise.
 *
 * The mirror of `toScheduledAt`: bookings are matched against what the caller
 * says out loud ("the ten o'clock"), and ten o'clock means ten o'clock where
 * the business is.
 */
export function localParts(instant: Date, timeZone: string): { date: string; time: string } {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(instant);

    const field = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
    return {
      date: `${field("year")}-${field("month")}-${field("day")}`,
      time: `${field("hour")}:${field("minute")}`,
    };
  } catch {
    return { date: instant.toISOString().slice(0, 10), time: instant.toISOString().slice(11, 16) };
  }
}

/** How the employee should say a booking's time back to the caller. */
export function spokenWhen(instant: Date | null, timeZone: string): string {
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

/** A time the caller gave, in the form the stored booking reads back as. */
export function normaliseClock(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  return match ? `${match[1]!.padStart(2, "0")}:${match[2]}` : null;
}

/** A date the caller gave, as the stored booking reads back. */
export function normaliseDate(raw: unknown): string | null {
  return typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : null;
}
