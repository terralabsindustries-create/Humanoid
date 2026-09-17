import type { ToolDefinition } from "@/modules/telephony/llm.js";
import {
  checkAvailability,
  getSchedule,
  hasCapacity,
  hasOpeningHours,
  localClock,
  periodsOn,
  spokenMinute,
  suggestSlots,
  type AvailabilityVerdict,
  type Schedule,
} from "@/modules/schedule/schedule.service.js";
import { spokenWhen, toScheduledAt } from "@/modules/telephony/spoken-time.js";

/**
 * The tool the prompt used to forbid.
 *
 * Until now `create_booking`'s own description said, in as many words, "Do not
 * call it to check availability — you cannot check availability", and the
 * system prompt told the employee to never say whether a time was free. That
 * was honest, and it meant every caller asking the most ordinary question a
 * business gets — "are you free Thursday evening?" — was answered with a
 * promise that somebody would ring them back.
 *
 * What makes this safe to add is the thing `schedule.service.ts` refuses to
 * do: it never reports a slot as free when it had nothing to check it
 * against. An unconfigured workspace comes back `unchecked`, and the employee
 * is handed the same sentence it says today. The tool becomes more capable
 * only for a business that has actually told it when it is open.
 *
 * Industry-neutral like the booking tools, for the same reason: a clinic's
 * receptionist and a restaurant's host call the identical function, and the
 * words around it come from the tenant's own configuration.
 */

export const AVAILABILITY_TOOL_NAME = "check_availability";

export const availabilityTool: ToolDefinition = {
  name: AVAILABILITY_TOOL_NAME,
  description:
    "Check whether the business can take a booking at a particular date and time, before you " +
    "promise anything. Use it as soon as the caller names a time they want, and whenever they " +
    "ask what is free. It only reads; it books nothing. If it tells you the time will not work " +
    "it also gives you the nearest times that will — offer those to the caller rather than " +
    "just saying no.",
  parameters: {
    type: "object",
    properties: {
      date: { type: "string", description: "The date they want, as ISO 8601 YYYY-MM-DD." },
      time: {
        type: "string",
        description:
          "The time they want, as 24-hour HH:MM. Leave it out to ask what is free on that " +
          "date at all.",
      },
    },
    required: ["date"],
  },
};

export type AvailabilityContext = {
  workspaceId: string;
  timezone: string;
};

/**
 * How a verdict is put into the employee's mouth.
 *
 * Shared with `create_booking`, which runs the identical check before writing,
 * so the two can never describe the same diary differently — a caller told
 * half past seven was free and then refused it at the point of booking is a
 * worse experience than never having been offered it.
 *
 * Every branch tells the model what to *do*, not just what is true. A model
 * handed "status: full" invents its own recovery; handed "offer these three
 * times", it offers them.
 */
export function describeVerdict(
  verdict: AvailabilityVerdict,
  at: Date,
  timezone: string,
  options: { forBooking?: boolean; refusal?: string } = {},
): string {
  const when = spokenWhen(at, timezone);

  if (verdict.status === "unchecked") {
    return (
      `There is no diary to check — this business has not set its opening hours or capacity, so ` +
      `nothing here knows whether ${when} is free. Do not tell the caller it is available and do ` +
      `not tell them it is not. Take what they ask for and let staff resolve any clash.`
    );
  }

  if (verdict.status === "open") {
    const caveat = verdict.checked.capacity
      ? ""
      : " Capacity is not configured, so this only confirms the business is open then — do not " +
        "claim the diary has room.";
    return options.forBooking
      ? `${when} is within opening hours and has room.${caveat}`
      : `Yes — ${when} works. Offer it to the caller and take their booking if they want it.${caveat}`;
  }

  const offer =
    verdict.alternatives.length > 0
      ? ` The nearest times that do work are: ${verdict.alternatives
          .map((slot) => spokenWhen(slot, timezone))
          .join("; ")}. Offer these to the caller, shortest list first, and ask which suits.`
      : ` There is nothing nearby that works either. Do not invent a time — say you cannot fit ` +
        `them in then, take their details, and use flag_unresolved.`;

  // The refusal names what did *not* happen before it names why. On a reschedule
  // that sentence has to be different — "nothing was booked" would leave the
  // model unsure whether the booking it was moving still exists.
  const opening = options.refusal
    ? `${options.refusal} ${capitalise(verdict.reason)}.`
    : options.forBooking
      ? `Nothing was booked: ${verdict.reason}.`
      : `No — ${when} will not work, because ${verdict.reason}.`;

  return `${opening}${offer}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "What have you got on Thursday?" — the question with no time in it.
 *
 * Answered from the opening pattern plus real occupancy, rather than by
 * reciting every slot in the day. A caller cannot hold eighteen times in their
 * head, and a list read down a phone line is worse than three good options.
 */
async function describeDay(
  context: AvailabilityContext,
  schedule: Schedule,
  date: string,
  at: Date,
): Promise<string> {
  const periods = periodsOn(schedule, date) ?? [];

  if (periods.length === 0) {
    const exception = schedule.exceptions.find((e) => e.date === date);
    const why = exception?.reason ? ` for ${exception.reason}` : "";
    const nearby = await suggestSlots({ workspaceId: context.workspaceId, at, schedule });
    return (
      `The business is closed that day${why}.` +
      (nearby.length > 0
        ? ` The nearest times that do work are: ${nearby
            .map((slot) => spokenWhen(slot, schedule.timezone))
            .join("; ")}. Offer those instead.`
        : ` Take their details and use flag_unresolved.`)
    );
  }

  const spans = periods
    .map((p) => `${spokenMinute(p.opensMinute)} to ${spokenMinute(p.closesMinute)}`)
    .join(" and ");

  if (!hasCapacity(schedule)) {
    return (
      `That day the business is open ${spans}. Capacity is not configured, so you cannot say ` +
      `which times are already taken — ask the caller what time suits them within those hours ` +
      `and take the booking.`
    );
  }

  const free = await suggestSlots({
    workspaceId: context.workspaceId,
    at,
    schedule,
    limit: 3,
    horizonDays: 0,
    // The anchor is midday, not something the caller asked for — dropping it
    // would hide a free noon slot from a caller asking what the day has.
    excludeRequested: false,
  });

  return free.length > 0
    ? `That day the business is open ${spans}, and these times still have room: ${free
        .map((slot) => spokenWhen(slot, schedule.timezone))
        .join("; ")}. Offer a couple of those rather than reading out the whole day.`
    : `That day the business is open ${spans} but it is fully booked. Offer another day, or ` +
      `take their details and use flag_unresolved.`;
}

export async function runCheckAvailability(
  context: AvailabilityContext,
  args: Record<string, unknown>,
): Promise<string> {
  // Midday rather than midnight when no time was given: it is the middle of a
  // trading day, so "nearest slot" searches outward through hours the business
  // is actually open instead of starting eight hours before it unlocks.
  const at = toScheduledAt(args.date, args.time ?? "12:00", context.timezone);
  if (!at) {
    return (
      "That did not work: the date was not usable. Ask the caller which day they mean and " +
      "work out the actual date yourself — never pass a word like tomorrow."
    );
  }

  let schedule: Schedule | null;
  try {
    schedule = await getSchedule(context.workspaceId);
  } catch (error) {
    console.error(
      "[VOICE] could not read the schedule:",
      error instanceof Error ? error.message : error,
    );
    // Degrades to exactly what the employee could say before this tool
    // existed. A diary lookup failing must never become a refusal to book.
    return (
      "That did not work: the diary did not respond. Do not tell the caller a time is free or " +
      "taken. Take what they ask for and let staff resolve any clash."
    );
  }

  if (!schedule || (!hasOpeningHours(schedule) && !hasCapacity(schedule))) {
    return describeVerdict({ status: "unchecked", checked: { hours: false, capacity: false, horizon: false } }, at, context.timezone);
  }

  // No time given — the caller is asking about the day, not about a slot.
  if (typeof args.time !== "string" || args.time.trim().length === 0) {
    return describeDay(context, schedule, localClock(at, schedule.timezone).date, at);
  }

  const verdict = await checkAvailability({ workspaceId: context.workspaceId, at, schedule });
  return describeVerdict(verdict, at, context.timezone);
}
