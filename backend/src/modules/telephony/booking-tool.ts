import type { ToolDefinition, ToolRunner } from "@/modules/telephony/llm.js";
import {
  BOOKING_TYPE_ID,
  cancelRecord,
  createRecord,
  listUpcomingBookingsForPhone,
  rescheduleRecord,
  type CallerBooking,
} from "@/modules/records/record.service.js";
import { isIdentifiablePhone, rememberCaller } from "@/modules/parties/party.service.js";
import { raiseIssueSafely } from "@/modules/review/review.service.js";
import {
  availabilityTool,
  AVAILABILITY_TOOL_NAME,
  describeVerdict,
  runCheckAvailability,
} from "@/modules/telephony/availability-tool.js";
import { checkAvailability } from "@/modules/schedule/schedule.service.js";
import {
  asText,
  localParts,
  normaliseClock,
  normaliseDate,
  spokenWhen,
  toScheduledAt,
} from "@/modules/telephony/spoken-time.js";

/**
 * The employee's first real business action.
 *
 * Until now a call could only produce a transcript — the employee could
 * promise a follow-up but not take one. This is the tool that changes that: a
 * booking made mid-call, written to `records`, and visible on the Reservations
 * screen before the caller has hung up.
 *
 * Deliberately industry-neutral. The tool is described in plain functional
 * terms and the tenant's own system prompt supplies the context, so a hotel's
 * concierge and a clinic's receptionist call the same function and speak to
 * their caller in their own words. Putting "reservation" in here would make
 * the backend hold industry knowledge that belongs in the frontend's domain
 * packs.
 */

export const BOOKING_TOOL_NAME = "create_booking";

export const bookingTool: ToolDefinition = {
  name: BOOKING_TOOL_NAME,
  description:
    "Record a booking for the caller once you have their name and when they want it. " +
    "Call this only after the caller has given you a specific date and time and you have " +
    "read the details back to them. This creates a real booking the business will act on. " +
    "Use check_availability first to make sure the time works — this tool refuses a time the " +
    "business is closed or fully booked, and you should not have promised it in the first place.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "The caller's full name, spelled as they gave it." },
      date: { type: "string", description: "The date, as ISO 8601 YYYY-MM-DD." },
      time: { type: "string", description: "The time, as 24-hour HH:MM." },
      partySize: { type: "integer", description: "How many people, if the caller said." },
      notes: {
        type: "string",
        description: "Anything else the business needs: access needs, an occasion, a room or table preference.",
      },
    },
    required: ["name", "date", "time"],
  },
};

export type BookingContext = {
  workspaceId: string;
  /** Absent on a call that reached no configured employee. */
  aiEmployeeId?: string | null;
  conversationId: string | null;
  callerNumber: string | null;
  timezone: string;
};




/**
 * Files the caller in the customer directory under the name they just gave.
 *
 * The name reached us through speech recognition, so it lands as something
 * the AI noted rather than something anybody checked — which is exactly the
 * claim the directory asks a human to confirm or correct.
 */
async function rememberBookingCaller(context: BookingContext, name: string): Promise<string | null> {
  try {
    return await rememberCaller({
      workspaceId: context.workspaceId,
      phone: context.callerNumber,
      name,
      conversationId: context.conversationId,
    });
  } catch (error) {
    console.error(
      "[VOICE] could not record the caller against this booking:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}


// ────────────────────────────────────────────── changing an existing booking

export const RESCHEDULE_TOOL_NAME = "reschedule_booking";
export const CANCEL_TOOL_NAME = "cancel_booking";
export const FIND_BOOKINGS_TOOL_NAME = "find_bookings";

/**
 * The three tools that operate on a booking the caller already has.
 *
 * They exist because the alternative is what happens without them: a caller
 * who rings back to move Thursday to Friday gets a *second* booking, the first
 * one stays confirmed, and the business holds two tables for one party. The
 * model cannot be prompted out of that — with only `create_booking` on hand,
 * creating another row is the only action available to it.
 *
 * Deliberately industry-neutral for the same reason `create_booking` is: the
 * tenant's own prompt supplies the words, so a clinic and a restaurant call
 * the identical function.
 */

export const findBookingsTool: ToolDefinition = {
  name: FIND_BOOKINGS_TOOL_NAME,
  description:
    "Look up what this caller already has booked, using the number they are calling from. " +
    "Use it whenever they refer to an existing booking — to change it, to cancel it, or " +
    "just to ask when it is. It only reads; it changes nothing.",
  parameters: { type: "object", properties: {}, required: [] },
};

export const rescheduleTool: ToolDefinition = {
  name: RESCHEDULE_TOOL_NAME,
  description:
    "Move a booking this caller already has to a different date or time. Always use this " +
    "rather than cancelling and making a new booking — cancelling and re-booking leaves the " +
    "business two entries for one caller. If they have more than one booking, say which one " +
    "by passing its current date and time.",
  parameters: {
    type: "object",
    properties: {
      newDate: { type: "string", description: "The date it is moving to, as ISO 8601 YYYY-MM-DD." },
      newTime: { type: "string", description: "The time it is moving to, as 24-hour HH:MM." },
      currentDate: {
        type: "string",
        description: "The existing booking's date, as ISO 8601 YYYY-MM-DD. Only needed to tell two bookings apart.",
      },
      currentTime: {
        type: "string",
        description: "The existing booking's time, as 24-hour HH:MM. Only needed to tell two bookings apart.",
      },
    },
    required: ["newDate", "newTime"],
  },
};

export const cancelTool: ToolDefinition = {
  name: CANCEL_TOOL_NAME,
  description:
    "Cancel a booking this caller already has. Use it only when they want the booking gone " +
    "altogether — if they want a different date or time, use reschedule_booking instead. " +
    "If they have more than one booking, say which one by passing its date and time.",
  parameters: {
    type: "object",
    properties: {
      date: { type: "string", description: "The booking's date, as ISO 8601 YYYY-MM-DD." },
      time: { type: "string", description: "The booking's time, as 24-hour HH:MM." },
      reason: { type: "string", description: "Why they are cancelling, if they said." },
    },
    required: [],
  },
};

/** Every tool this module owns, in the order the model sees them. */
export const bookingTools: ToolDefinition[] = [
  availabilityTool,
  bookingTool,
  findBookingsTool,
  rescheduleTool,
  cancelTool,
];

/** True when the model is asking for something this module handles. */
export function isBookingTool(name: string): boolean {
  return bookingTools.some((tool) => tool.name === name);
}




/** How the model is told what the caller has, when it has to choose. */
function describeBookings(bookings: CallerBooking[], timeZone: string): string {
  return bookings
    .map((b) => `${spokenWhen(b.scheduledAt, timeZone)}${b.partyName ? ` under ${b.partyName}` : ""}`)
    .join("; ");
}

type Resolution =
  | { found: true; booking: CallerBooking; others: CallerBooking[] }
  | { found: false; reply: string };

/**
 * Which of the caller's bookings they mean.
 *
 * Never guesses. A near miss on the time is far more likely to be a
 * mis-transcription than a second booking, but acting on the guess would
 * cancel the wrong table — so an ambiguous or unmatched request comes back as
 * the list of what the caller actually has, for the employee to confirm out
 * loud before trying again. One round trip is cheap; cancelling someone else's
 * dinner is not.
 */
async function resolveBooking(
  context: BookingContext,
  identify: { date: string | null; time: string | null },
): Promise<Resolution> {
  if (!isIdentifiablePhone(context.callerNumber)) {
    return {
      found: false,
      reply:
        "That did not work: this caller's number is withheld, so their bookings cannot be " +
        "looked up. Tell them you cannot find it from this number, take their name and a " +
        "number to reach them on, and say a colleague will sort it out. Use flag_unresolved.",
    };
  }

  let bookings: CallerBooking[];
  try {
    bookings = await listUpcomingBookingsForPhone(context.workspaceId, context.callerNumber);
  } catch (error) {
    console.error(
      "[VOICE] could not look up the caller's bookings:",
      error instanceof Error ? error.message : error,
    );
    return {
      found: false,
      reply:
        "That did not work: the booking system did not respond. Do not tell the caller their " +
        "booking has been changed. Apologise, take their details, and use flag_unresolved.",
    };
  }

  if (bookings.length === 0) {
    return {
      found: false,
      reply:
        "There are no upcoming bookings under this caller's number. Do not say one exists. " +
        "Ask whether they booked under a different number — and if they are sure, take their " +
        "details, say a colleague will check, and use flag_unresolved.",
    };
  }

  const matches = bookings.filter((booking) => {
    if (!booking.scheduledAt) return false;
    const local = localParts(booking.scheduledAt, context.timezone);
    if (identify.date && local.date !== identify.date) return false;
    if (identify.time && local.time !== identify.time) return false;
    return true;
  });

  if (matches.length === 1) {
    const booking = matches[0]!;
    return { found: true, booking, others: bookings.filter((b) => b.id !== booking.id) };
  }

  // Nothing matched, or several did. Either way the caller has to settle it.
  const listed = describeBookings(bookings, context.timezone);
  return {
    found: false,
    reply:
      matches.length === 0
        ? `There is no booking at that time under this caller's number. What they do have is: ` +
          `${listed}. Read that back and ask if that is the one they mean, then try again with ` +
          `its date and time.`
        : `This caller has more than one booking that matches: ${listed}. Ask which one they ` +
          `mean and try again with its exact date and time.`,
  };
}

// ────────────────────────────────────────────────────────── the four handlers

async function runFindBookings(context: BookingContext): Promise<string> {
  if (!isIdentifiablePhone(context.callerNumber)) {
    return (
      "That did not work: this caller's number is withheld, so their bookings cannot be " +
      "looked up. Tell them you cannot find it from this number and take their details."
    );
  }

  let bookings: CallerBooking[];
  try {
    bookings = await listUpcomingBookingsForPhone(context.workspaceId, context.callerNumber);
  } catch (error) {
    console.error(
      "[VOICE] could not look up the caller's bookings:",
      error instanceof Error ? error.message : error,
    );
    return "That did not work: the booking system did not respond. Do not guess at what they have booked.";
  }

  if (bookings.length === 0) {
    return (
      "This caller has no upcoming bookings under the number they are calling from. Do not " +
      "say one exists. If they are sure they booked, ask whether it was under another number."
    );
  }

  return (
    `This caller has: ${describeBookings(bookings, context.timezone)}. ` +
    `Use this to answer them. Do not read out any reference number.`
  );
}

async function runReschedule(context: BookingContext, args: Record<string, unknown>): Promise<string> {
  const scheduledAt = toScheduledAt(args.newDate, args.newTime, context.timezone);
  if (!scheduledAt) {
    return (
      "That did not work: the new date or time was not usable. Ask the caller to say the new " +
      "date and time again."
    );
  }

  const resolved = await resolveBooking(context, {
    date: normaliseDate(args.currentDate),
    time: normaliseClock(args.currentTime),
  });
  if (!resolved.found) return resolved.reply;

  const was = spokenWhen(resolved.booking.scheduledAt, context.timezone);

  // A move is a booking too. Without this, the one path that exists precisely
  // so a caller does not end up with two bookings would happily move them into
  // a closed Sunday — and `reschedule_booking` is the tool a caller reaches
  // for *after* being told a time was unavailable, so it is the likeliest
  // place to try one.
  //
  // The booking excludes itself from the capacity count: at a business seating
  // one party per slot, moving 19:00 to 19:00 would otherwise be blocked by
  // the very row being moved.
  let moveVerdict: Awaited<ReturnType<typeof checkAvailability>>;
  try {
    moveVerdict = await checkAvailability({
      workspaceId: context.workspaceId,
      at: scheduledAt,
      ignoreRecordId: resolved.booking.id,
    });
  } catch (error) {
    console.error(
      "[VOICE] availability check failed, moving anyway:",
      error instanceof Error ? error.message : error,
    );
    moveVerdict = { status: "unchecked", checked: { hours: false, capacity: false, horizon: false } };
  }

  if (moveVerdict.status !== "open" && moveVerdict.status !== "unchecked") {
    return describeVerdict(moveVerdict, scheduledAt, context.timezone, {
      refusal: `Nothing was moved — the booking is still ${was}, and the new time will not work.`,
    });
  }

  let moved: boolean;
  try {
    moved = await rescheduleRecord({
      workspaceId: context.workspaceId,
      recordId: resolved.booking.id,
      scheduledAt,
    });
  } catch (error) {
    return failedWrite(context, error, "reschedule", was);
  }

  if (!moved) {
    return (
      "That did not work: that booking could no longer be found. Do not tell the caller it has " +
      "moved. Take their details and use flag_unresolved."
    );
  }

  console.log(
    `[VOICE] booking ${resolved.booking.id} moved to ${scheduledAt.toISOString()} ` +
      `(${String(args.newTime)} ${context.timezone})`,
  );

  return (
    `Moved. The booking that was ${was} is now ${spokenWhen(scheduledAt, context.timezone)}, and ` +
    `there is only the one booking — nothing was left behind at the old time. Tell the caller it ` +
    `is changed, read the new date and time back once, and do not repeat any reference number.`
  );
}

async function runCancel(context: BookingContext, args: Record<string, unknown>): Promise<string> {
  const resolved = await resolveBooking(context, {
    date: normaliseDate(args.date),
    time: normaliseClock(args.time),
  });
  if (!resolved.found) return resolved.reply;

  const was = spokenWhen(resolved.booking.scheduledAt, context.timezone);

  let cancelled: boolean;
  try {
    cancelled = await cancelRecord({
      workspaceId: context.workspaceId,
      recordId: resolved.booking.id,
      reason: asText(args.reason),
    });
  } catch (error) {
    return failedWrite(context, error, "cancel", was);
  }

  if (!cancelled) {
    return (
      "That did not work: that booking could no longer be found. Do not tell the caller it is " +
      "cancelled. Take their details and use flag_unresolved."
    );
  }

  console.log(`[VOICE] booking ${resolved.booking.id} cancelled`);

  const remaining =
    resolved.others.length > 0
      ? ` They still have: ${describeBookings(resolved.others, context.timezone)}.`
      : "";

  return (
    `Cancelled. The booking ${was} is no longer held. Tell the caller it is cancelled and say ` +
    `the date and time once so they know which one went.${remaining}`
  );
}

/**
 * A write that failed with a caller on the line.
 *
 * The same shape as `create_booking`'s: the model is told plainly not to claim
 * it worked, and Review gets the real error — a caller told their booking has
 * moved when it has not is the failure this system can least afford, because
 * the transcript reads like a good call and the diary disagrees.
 */
async function failedWrite(
  context: BookingContext,
  error: unknown,
  action: "reschedule" | "cancel",
  was: string,
): Promise<string> {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`[VOICE] booking ${action} failed: ${reason}`);

  await raiseIssueSafely({
    workspaceId: context.workspaceId,
    aiEmployeeId: context.aiEmployeeId ?? null,
    conversationId: context.conversationId,
    cause: "tool_failure",
    topic: `booking could not be ${action === "cancel" ? "cancelled" : "moved"}`,
    title: `Bookings are failing to ${action === "cancel" ? "cancel" : "reschedule"}`,
    detail:
      "The employee tried to change a booking a caller had already made and the write " +
      "failed. Until this is fixed, callers ringing to change or cancel are leaving the " +
      "call believing something the diary does not say.",
    evidence: `${reason} (booking was ${was})`,
  });

  return (
    `That did not work: the change could not be saved. Do not tell the caller their booking has ` +
    `been ${action === "cancel" ? "cancelled" : "moved"}. Apologise, take their name and number, ` +
    `and say a colleague will call them back to sort it out.`
  );
}

async function runCreateBooking(context: BookingContext, args: Record<string, unknown>): Promise<string> {
  const guestName = asText(args.name);
  if (!guestName) return "That did not work: no name was given. Ask the caller for their name.";

  const scheduledAt = toScheduledAt(args.date, args.time, context.timezone);
  if (!scheduledAt) {
    return "That did not work: the date or time was not usable. Ask the caller to say the date and time again.";
  }

  const partySize = typeof args.partySize === "number" ? args.partySize : null;
  const notes = asText(args.notes);

  // What this caller already has, read before writing anything.
  //
  // Two different failures come out of this one lookup. A repeated tool call
  // for the same slot — a retry, or a model that lost track mid-turn — must
  // not become a second identical row. And a caller who is plainly *moving* a
  // booking rather than adding one is the exact case that produced two live
  // bookings for one table, so the employee is told about the other one
  // rather than left to find out from an angry phone call later.
  const existing = isIdentifiablePhone(context.callerNumber)
    ? await listUpcomingBookingsForPhone(context.workspaceId, context.callerNumber).catch(() => [])
    : [];

  const duplicate = existing.find((b) => b.scheduledAt?.getTime() === scheduledAt.getTime());
  if (duplicate) {
    return (
      `That is already booked — this caller has a booking at ${spokenWhen(scheduledAt, context.timezone)} ` +
      `and a second one was not created. Confirm the existing booking to them as it stands.`
    );
  }

  // The diary, consulted before anything is written.
  //
  // This is the check that did not exist when this tool was first built, and
  // its absence was invisible in exactly the way that matters: a caller could
  // be confirmed for three in the morning at a clinic that opens at eight, and
  // the transcript read like a good call. The model is *told* to check first
  // via check_availability, but a prompt is not an enforcement point — a model
  // that skips the step, or one whose earlier check went stale during a long
  // call, must still not be able to write a booking the business cannot keep.
  //
  // A workspace with no schedule configured comes back `unchecked` and books
  // exactly as it always did. This gate can only ever tighten for a business
  // that has said when it is open.
  let verdict: Awaited<ReturnType<typeof checkAvailability>>;
  try {
    verdict = await checkAvailability({ workspaceId: context.workspaceId, at: scheduledAt });
  } catch (error) {
    // A diary lookup failing must not cost the business a booking. It fails
    // open, for the same reason the spend cap does: the cost of a clash staff
    // can resolve is far lower than the cost of refusing a paying caller
    // because of an outage they cannot see.
    console.error(
      "[VOICE] availability check failed, booking anyway:",
      error instanceof Error ? error.message : error,
    );
    verdict = { status: "unchecked", checked: { hours: false, capacity: false, horizon: false } };
  }

  if (verdict.status !== "open" && verdict.status !== "unchecked") {
    return describeVerdict(verdict, scheduledAt, context.timezone, { forBooking: true });
  }

  const partyId = await rememberBookingCaller(context, guestName);

  // The workspace comes from the signed call context, never from the model's
  // arguments — a hallucinated workspace id must not be able to write into
  // another tenant.
  let id: string;
  try {
    id = await createRecord({
      workspaceId: context.workspaceId,
      conversationId: context.conversationId,
      partyId,
      archetype: "visit",
      typeId: BOOKING_TYPE_ID,
      status: "confirmed",
      partyName: guestName,
      partyPhone: context.callerNumber,
      scheduledAt,
      fields: {
        ...(partySize !== null ? { partySize } : {}),
        ...(notes ? { notes } : {}),
        bookedBy: "ai_employee",
      },
    });
  } catch (error) {
    // A booking the caller was about to be told was confirmed, that did not
    // get written. This is the most expensive failure this tool has and the
    // one least visible afterwards — the transcript would show a helpful
    // call, and the diary would show nothing. It goes to Review with the
    // real error string attached, and the model is told plainly not to
    // claim it worked.
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[VOICE] booking write failed: ${reason}`);

    await raiseIssueSafely({
      workspaceId: context.workspaceId,
      aiEmployeeId: context.aiEmployeeId ?? null,
      conversationId: context.conversationId,
      cause: "tool_failure",
      topic: "booking could not be written",
      title: "Bookings are failing to save",
      detail:
        "The employee collected a caller's details and tried to write the booking, and " +
        "the write failed. Until this is fixed every caller who books is being told " +
        "something the business has no record of.",
      evidence: reason,
    });

    return (
      "That did not work: the booking could not be saved. Do not tell the caller it is " +
      "confirmed. Apologise, take their name and number, and say a colleague will call " +
      "them back to confirm."
    );
  }

  console.log(
    `[VOICE] booking created ${id} for ${scheduledAt.toISOString()} ` +
      `(${String(args.time)} ${context.timezone})`,
  );

  // Said only if there is something to say. The employee is told what to do
  // about it, not told to announce it — a caller does not need to hear the
  // system reasoning about its own rows.
  const alsoHolds =
    existing.length > 0
      ? ` Note: this caller also already has ${describeBookings(existing, context.timezone)}. ` +
        `If they meant to move that one rather than add another, use reschedule_booking or ` +
        `cancel_booking now, and only mention it to the caller if you need to ask them.`
      : "";

  return (
    `Booked and confirmed. Tell the caller it is confirmed, read back the date and time ` +
    `once, and do not repeat any reference number.${alsoHolds}`
  );
}

/** Builds a runner bound to one call, so a tool can only ever write to its own tenant. */
export function bookingRunner(context: BookingContext): ToolRunner {
  return async (name, args) => {
    switch (name) {
      case AVAILABILITY_TOOL_NAME:
        return runCheckAvailability(context, args);
      case BOOKING_TOOL_NAME:
        return runCreateBooking(context, args);
      case FIND_BOOKINGS_TOOL_NAME:
        return runFindBookings(context);
      case RESCHEDULE_TOOL_NAME:
        return runReschedule(context, args);
      case CANCEL_TOOL_NAME:
        return runCancel(context, args);
      default:
        return `There is no tool called ${name}. Tell the caller you cannot do that yet.`;
    }
  };
}
