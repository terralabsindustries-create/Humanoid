import { env } from "@/config/env.js";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/db/client.js";
import {
  activeProvider,
  addTokenUsage,
  generateReply,
  NO_TOKEN_USAGE,
  type TokenUsage,
  type Turn,
} from "@/modules/telephony/llm.js";
import { endCall, recordTurn, startCall } from "@/modules/conversations/conversation.service.js";
import { rememberCaller } from "@/modules/parties/party.service.js";
import {
  isReturningCaller,
  recogniseCaller,
  roughlyAgo,
  spokenDate,
  type CallerContext,
} from "@/modules/telephony/caller-context.js";
import { callParties } from "@/modules/telephony/twilio-request.js";
import {
  describeSchedule,
  NO_SCHEDULE_AWARENESS,
  todayLocalDate,
  type ScheduleAwareness,
} from "@/modules/schedule/schedule.service.js";

/**
 * Turns a caller's transcribed speech into something the AI employee says back,
 * using the configuration onboarding already wrote to Postgres.
 *
 * Conversation state lives in memory, keyed by CallSid — deliberately not in
 * Postgres. Call transcripts are a real feature with their own tables and a
 * frontend surface; a Map that dies with the process is honestly temporary,
 * where a half-built `calls` table would look like the real thing.
 */

export type ResolvedEmployee = {
  workspaceId: string;
  employeeId: string;
  employeeName: string;
  roleName: string;
  businessName: string;
  industryKey: string | null;
  timezone: string;
  behavior: unknown;
  escalationRules: unknown;
  operatingRules: unknown;
  /**
   * What this business has told us about its own week, resolved once when the
   * call connects. The prompt is rebuilt every turn and has to stay
   * synchronous, so this cannot be a lookup — and because it hangs off the
   * employee, both transports get the identical sentences.
   */
  schedule: ScheduleAwareness;
};

type Conversation = {
  employee: ResolvedEmployee;
  /** Who the business already knows this to be. Null for a stranger. */
  caller: CallerContext | null;
  turns: Turn[];
  startedAt: number;
  /** Row in `conversations`. The in-memory turns are the model's working
   *  context; Postgres holds the durable transcript. */
  conversationId: string | null;
  /** Tokens this call has burned, summed as each turn returns. */
  tokens: TokenUsage;
};

const conversations = new Map<string, Conversation>();

/** A call that never hangs up cleanly shouldn't leak its history forever. */
const CONVERSATION_TTL_MS = 60 * 60 * 1000;

/** CallSids mid-call on the `<Gather>` transport, for the same reason. */
export function liveGatherCallSids(): string[] {
  return [...conversations.keys()];
}

export function isAiReceptionistEnabled(): boolean {
  return activeProvider() !== null;
}

/** How a call was routed to a tenant. Logged so a wrong answer is visible. */
export type RoutingBasis = "phone_number" | "env_pin" | "most_recent";

export type RoutedEmployee = { employee: ResolvedEmployee; basis: RoutingBasis };

/**
 * Which AI employee picks up, for a call dialled to `toNumber`.
 *
 * Three rungs, most specific first:
 *
 * 1. **The number dialled.** A workspace that owns a phone number answers on
 *    it. This is the only rung that is correct with more than one tenant.
 * 2. **`AI_EMPLOYEE_WORKSPACE_ID`.** A deployment-wide pin, for a single-tenant
 *    install or a number that has not been assigned yet.
 * 3. **The most recently configured employee.** A development convenience that
 *    is actively wrong once a second tenant exists — whoever onboarded last
 *    silently steals the phone line from whoever owns it. It logs a warning
 *    saying exactly that, because the failure is otherwise invisible: the call
 *    connects, a confident voice answers, and it belongs to another business.
 */
export async function resolveEmployeeForCall(toNumber: string | undefined): Promise<RoutedEmployee | null> {
  if (toNumber) {
    const owner = await prisma.workspace.findUnique({
      where: { phoneNumber: toNumber },
      select: { id: true },
    });
    if (owner) {
      const employee = await resolveAiEmployeeForWorkspace(owner.id);
      if (employee) return { employee, basis: "phone_number" };
      console.warn(
        `[Twilio] ${toNumber} is assigned to a workspace with no configured AI employee — falling through`,
      );
    }
  }

  if (env.AI_EMPLOYEE_WORKSPACE_ID) {
    const employee = await resolveAiEmployeeForWorkspace(env.AI_EMPLOYEE_WORKSPACE_ID);
    if (employee) return { employee, basis: "env_pin" };
  }

  const employee = await resolveAiEmployee();
  if (!employee) return null;

  console.warn(
    `[Twilio] No workspace owns ${toNumber ?? "this number"} and no AI_EMPLOYEE_WORKSPACE_ID is set — ` +
      `answering as the most recently configured employee (${employee.employeeName} @ ${employee.businessName}). ` +
      `Assign the number to a workspace to make this deterministic.`,
  );
  return { employee, basis: "most_recent" };
}

async function resolveAiEmployeeForWorkspace(workspaceId: string): Promise<ResolvedEmployee | null> {
  const employee = await prisma.aiEmployee.findFirst({
    where: { workspaceId, currentConfigurationVersionId: { not: null } },
    orderBy: { updatedAt: "desc" },
    include: { workspace: { include: { organization: true, ...scheduleInclude() } }, configurationVersions: true },
  });

  return employee ? toResolvedEmployee(employee) : null;
}

/**
 * The unrouted fallback: the most recently configured employee anywhere.
 * Only `resolveEmployeeForCall` should call this — it is the last rung.
 */
export async function resolveAiEmployee(): Promise<ResolvedEmployee | null> {
  const employee = await prisma.aiEmployee.findFirst({
    where: {
      ...(env.AI_EMPLOYEE_WORKSPACE_ID ? { workspaceId: env.AI_EMPLOYEE_WORKSPACE_ID } : {}),
      currentConfigurationVersionId: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      workspace: { include: { organization: true, ...scheduleInclude() } },
      configurationVersions: true,
    },
  });

  return employee ? toResolvedEmployee(employee) : null;
}

/**
 * The same employee, by id.
 *
 * The realtime relay uses this rather than re-running the "who picks up?"
 * heuristic above: the socket already carries a signed token naming the
 * employee the webhook chose, and re-deciding seconds later could land on a
 * different one — `resolveAiEmployee` orders by `updatedAt`, so another
 * tenant saving their configuration mid-call would be enough to change the
 * answer. Loading exactly what the token names removes the race.
 */
export async function resolveAiEmployeeById(employeeId: string): Promise<ResolvedEmployee | null> {
  const employee = await prisma.aiEmployee.findUnique({
    where: { id: employeeId },
    include: {
      workspace: { include: { organization: true, ...scheduleInclude() } },
      configurationVersions: true,
    },
  });

  return employee ? toResolvedEmployee(employee) : null;
}

/**
 * The schedule, loaded alongside the employee on all three routing paths.
 *
 * Shared so the three cannot drift into one path knowing the opening hours and
 * another answering the same number without them — which would show up as the
 * employee offering times on Monday and refusing to on Tuesday.
 *
 * Exceptions are filtered to today onwards: last Christmas is not something to
 * spend a caller's turn budget on, and a model told about it will mention it.
 */
function scheduleInclude() {
  // A day either side of UTC covers every timezone the business could be in;
  // `toResolvedEmployee` then trims to the tenant's own calendar date. Built
  // per call rather than as a module constant, which would pin "today" to
  // whenever the process started and quietly stop filtering after a day.
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return {
    businessHours: { orderBy: [{ dayOfWeek: "asc" }, { opensMinute: "asc" }] },
    scheduleExceptions: { where: { date: { gte: yesterday } }, orderBy: { date: "asc" }, take: 10 },
    bookingPolicy: true,
  } satisfies Prisma.WorkspaceInclude;
}

function toResolvedEmployee(employee: {
  id: string;
  name: string;
  roleName: string;
  timezone: string;
  workspaceId: string;
  currentConfigurationVersionId: string | null;
  workspace: {
    name: string;
    industryKey: string | null;
    organization: { name: string } | null;
    businessHours: { dayOfWeek: number; opensMinute: number; closesMinute: number }[];
    scheduleExceptions: {
      date: string;
      closed: boolean;
      opensMinute: number | null;
      closesMinute: number | null;
      reason: string | null;
    }[];
    bookingPolicy: { capacityPerSlot: number | null } | null;
  } | null;
  configurationVersions: {
    id: string;
    behaviorJson: unknown;
    escalationRulesJson: unknown;
    operatingRulesJson: unknown;
  }[];
}): ResolvedEmployee | null {
  const version = employee.configurationVersions.find((v) => v.id === employee.currentConfigurationVersionId);
  // An employee onboarding never finished configuring has nothing to answer
  // with, which is not the same as no employee existing.
  if (!version) return null;

  // Trimmed to the business's own calendar date, not the server's. A closure
  // that ended this morning in London is still "today" to a process running
  // in Auckland, and the employee would mention a closure that has passed.
  const today = todayLocalDate(employee.timezone);
  const upcoming = (employee.workspace?.scheduleExceptions ?? []).filter((e) => e.date >= today);

  return {
    workspaceId: employee.workspaceId,
    employeeId: employee.id,
    employeeName: employee.name,
    roleName: employee.roleName,
    businessName: employee.workspace?.name ?? employee.workspace?.organization?.name ?? "our business",
    industryKey: employee.workspace?.industryKey ?? null,
    timezone: employee.timezone,
    behavior: version.behaviorJson,
    escalationRules: version.escalationRulesJson,
    operatingRules: version.operatingRulesJson,
    schedule: employee.workspace
      ? describeSchedule(
          employee.workspace.businessHours,
          upcoming,
          employee.workspace.bookingPolicy?.capacityPerSlot ?? null,
        )
      : NO_SCHEDULE_AWARENESS,
  };
}

/**
 * Written by the employee when the conversation is genuinely over, and never
 * spoken — `voice-session.service.ts` strips it and hangs up.
 *
 * The model decides, rather than a farewell-phrase match here, because only
 * the model knows whether "thanks, bye" ended the call or was the caller
 * clearing their throat before the real question. Getting that wrong means
 * hanging up on a customer mid-sentence, which is far worse than a couple of
 * seconds of silence.
 *
 * Double brackets because no natural sentence contains them, so a caller
 * cannot say something that trips it.
 */
export const END_CALL_MARKER = "[[END_CALL]]";

/**
 * A model has no clock. Without today's date in its own words it turns
 * "Friday" into a date from whenever it was trained, and books a table for a
 * day that has already happened.
 */
function todayIn(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date());
  } catch {
    return new Date().toDateString();
  }
}

/**
 * Spoken immediately on pickup — no model round-trip, so there is no dead air.
 *
 * A returning caller is greeted as one. What varies is how much the greeting
 * dares to assert: a name a person has confirmed in the directory is used
 * flatly, a name that only speech recognition has ever heard is *asked*, and a
 * number we have spoken to before but never got a name from is welcomed back
 * without one. Anything else opens the call by calling somebody the wrong
 * name, which undoes more goodwill than the recognition wins.
 *
 * What the caller has booked is deliberately not said here. One phone can
 * belong to several people, and reading a stranger's reservation out to
 * whoever picked up is not a warm welcome — the employee has it in context
 * and can raise it once it knows who it is talking to.
 */
export function greetingFor(employee: ResolvedEmployee | null, caller?: CallerContext | null): string {
  if (!employee) return "Hello, thanks for calling. How can I help you today?";

  const opening = `Thanks for calling ${employee.businessName}. This is ${employee.employeeName}.`;
  const known = caller ?? null;

  if (!isReturningCaller(known)) {
    return `${opening} How can I help you today?`;
  }

  if (known.name && known.nameConfirmed) {
    return `Welcome back, ${known.name}. ${opening} How can I help you today?`;
  }
  if (known.name) {
    // Asked, not stated: the only source for this name is a phone line.
    return `${opening} Am I speaking with ${known.name}?`;
  }
  return `${opening} Good to hear from you again. How can I help you today?`;
}

/**
 * Shared by both transports. The `<Gather>` loop and the realtime relay must
 * put the same words in the employee's mouth — a second prompt built somewhere
 * else would drift, and the tenant's configuration would stop being the single
 * thing that decides how their employee behaves.
 */
export function buildSystemPrompt(employee: ResolvedEmployee, caller?: CallerContext | null): string {
  return [
    `You are ${employee.employeeName}, the ${employee.roleName} for ${employee.businessName}.`,
    `You are speaking with a customer on a live phone call. Their timezone is ${employee.timezone}.`,
    employee.industryKey ? `The business operates in: ${employee.industryKey}.` : "",
    "",
    "# Your configuration",
    "This was set by the business owner during setup. Follow it.",
    "",
    ...configuredAs("Behaviour", employee.behavior),
    ...configuredAs("Escalation rules", employee.escalationRules),
    ...configuredAs("Operating rules", employee.operatingRules),
    ...whoIsCalling(employee, caller ?? null),
    "# Speaking on the phone",
    "Every word you write is read aloud by a speech synthesiser, so write speech, not text.",
    "Keep replies to one or two short sentences — a caller cannot skim, and a long answer is",
    "painful to sit through. Ask one question at a time and wait for the answer.",
    "Never use markdown, bullet points, numbered lists, headings, emoji, or symbols like * or #.",
    "Write numbers, dates and times the way you would say them out loud.",
    "Do not narrate what you are doing, do not describe your reasoning, and do not read out any",
    "internal or system tags.",
    "",
    "# Ending the call",
    "When the caller is clearly finished — they have said goodbye, or confirmed they need",
    `nothing else — say a short, warm farewell and then write ${END_CALL_MARKER} at the very`,
    "end of your reply. That marker hangs up the phone. It is stripped before anything is",
    "spoken, so never read it out, never mention it, and never explain it.",
    "Only use it when the caller is genuinely done. If there is any chance they have more to",
    "say, leave it out and let them keep talking — a premature hang-up is much worse than a",
    "few seconds of silence.",
    "",
    ...openingHoursSection(employee),
    "# Taking a booking",
    "You can make a real booking, using the create_booking tool. It writes to the business's",
    "system immediately and staff will act on it, so treat it as final.",
    `Today is ${todayIn(employee.timezone)}. Work out the actual date the caller means from that`,
    "— never ask them for the year, and never pass a relative word like tomorrow as the date.",
    ...checkFirstLines(employee),
    "Collect their name and the date and time before you call it. Read the details back once to",
    "confirm you heard them correctly, then make the booking. Do not say you have booked anything",
    "until the tool has told you it worked.",
    "",
    "# Changing a booking they already have",
    "If a caller mentions a booking they have already made, use find_bookings to see it. It looks",
    "them up by the number they are calling from, so never ask them for a reference number.",
    "To move a booking to a different day or time, use reschedule_booking. Never cancel a booking",
    "and make a new one instead — that leaves the business holding two bookings for one caller.",
    "Use cancel_booking only when they want the booking gone altogether.",
    "If they have more than one booking, read back what they have and ask which one they mean",
    "before you change anything.",
    "",
    "# When you cannot help",
    "If a caller asks something your configuration does not answer, asks for something you",
    "cannot do, or something you try fails, use the flag_unresolved tool once for that",
    "problem. It tells the business what you ran into so they can fix it.",
    "It is completely silent — the caller does not hear it and there is nothing to mention.",
    "Never say you have logged, flagged, reported or escalated anything, and never read out",
    "the tool's reply. Use it and carry straight on with the call as naturally as you can.",
    "Flagging is not a substitute for helping: still take their details and promise a",
    "follow-up if that is genuinely all you can offer.",
    "",
    "# Honesty",
    ...availabilityHonesty(employee),
    "The only customer records you can see are this caller's own bookings, through find_bookings.",
    "You have no other customer records and no knowledge base beyond the configuration above. Do",
    "not invent prices or opening hours. If you cannot answer from your configuration, say plainly",
    "that you will take the details and have a colleague follow up, then collect what is needed.",
    "The caller's speech reaches you through automatic transcription and may be misheard — if a",
    "name, number, or date matters, read it back to confirm.",
  ]
    .filter(Boolean)
    .join("\n");
}


/**
 * When the business is open, stated once at the top rather than looked up.
 *
 * The employee answers "what time do you open?" far more often than it books
 * anything, and that question used to reach `flag_unresolved` — the prompt
 * forbade inventing opening hours, correctly, and the business had nothing
 * else to offer. Having the week in front of it turns the single most common
 * call this system gets into an answer.
 *
 * Dropped entirely for a workspace that has not set hours. A heading followed
 * by nothing spends attention telling the model it knows something it does
 * not, which is the failure this whole section exists to prevent.
 */
function openingHoursSection(employee: ResolvedEmployee): string[] {
  if (!employee.schedule.hasHours) return [];

  return [
    "# When the business is open",
    "These are the opening hours. You may state them to a caller who asks.",
    ...employee.schedule.openingLines,
    ...(employee.schedule.exceptionLines.length > 0
      ? ["Dates that are different from the usual pattern:", ...employee.schedule.exceptionLines]
      : []),
    "",
  ];
}

/** The instruction to look before promising — only where there is a diary. */
function checkFirstLines(employee: ResolvedEmployee): string[] {
  if (!employee.schedule.hasHours && !employee.schedule.hasCapacity) return [];

  return [
    "Before you promise a caller any particular time, use check_availability for it. If it says",
    "the time will not work it gives you the nearest times that will — offer two or three of",
    "those rather than telling the caller no and stopping there.",
  ];
}

/**
 * What the employee may claim about a time being free.
 *
 * Three states, and the middle one is the one worth getting right. A business
 * with opening hours but no capacity set knows it is *open* at seven on
 * Thursday and knows nothing about whether the diary has room — so it may say
 * the first and must not say the second. Collapsing that into "you can check
 * availability" is how an employee ends up confirming the twentieth table.
 */
function availabilityHonesty(employee: ResolvedEmployee): string[] {
  const { hasHours, hasCapacity } = employee.schedule;

  if (!hasHours && !hasCapacity) {
    return [
      "You cannot check availability — you have no calendar to look at — so never say whether a",
      "time is free or busy, and never offer a list of available times. Take what the caller asks",
      "for and let staff resolve any clash.",
    ];
  }

  if (hasHours && !hasCapacity) {
    return [
      "You know when the business is open, and check_availability will tell you whether a time",
      "falls inside those hours. You do not know how full the diary is — nobody has told this",
      "system its capacity — so you may say a time is within opening hours, and you must never",
      "say a time is free, available, or still has space. If a caller asks whether there is room,",
      "say you will take the booking and staff will confirm.",
    ];
  }

  return [
    "check_availability is the only thing that knows whether a time works. Never say a time is",
    "free or taken without calling it first, and never contradict what it told you — if it",
    "refused a time, that time is not available, however much the caller presses.",
  ];
}

/**
 * One configured section of the prompt, as words rather than as JSON.
 *
 * Onboarding stores answers as option ids — `warm_professional`,
 * `angry_guests` — because the words that produced them belong to the domain
 * pack that asked the question (root `CLAUDE.md` rule 10), and the backend
 * deliberately holds no industry vocabulary. Pasting the raw JSON into the
 * prompt made the model read `{"communicationStyle":"warm_professional"}` and
 * infer a personality from a slug wrapped in braces. Un-slugging is a generic
 * string transform, not industry knowledge: it gains the model plain English
 * without the backend learning what a guest is.
 *
 * An empty section is dropped entirely. `## Operating rules` followed by `{}`
 * spends tokens and attention telling the model nothing.
 */
function configuredAs(heading: string, value: unknown): string[] {
  const lines = describeConfig(value);
  return lines.length === 0 ? [] : [`## ${heading}`, ...lines, ""];
}

function describeConfig(value: unknown): string[] {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    const items = value.map(unslug).filter((item) => item.length > 0);
    return items.length > 0 ? [items.map((item) => `- ${item}`).join("\n")] : [];
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, raw]) => {
      const described = Array.isArray(raw)
        ? raw.map(unslug).filter(Boolean).join(", ")
        : unslug(raw);
      return described.length > 0 ? [`- ${unslug(key)}: ${described}`] : [];
    });
  }

  const described = unslug(value);
  return described.length > 0 ? [`- ${described}`] : [];
}

/** `warm_professional` → `warm professional`; `communicationStyle` → `communication style`. */
function unslug(value: unknown): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return "";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
}

/**
 * What the business already knows about whoever is on the line.
 *
 * This is the difference between a switchboard and someone who works there.
 * It is stated as *evidence with its provenance attached* rather than as
 * fact, because that is what it is: a number that has called before, a name
 * that may only ever have been heard over a phone line, and bookings read at
 * the moment the call connected. The employee is told plainly that the phone
 * may be shared, and that the caller's own word beats every line of it.
 */
function whoIsCalling(employee: ResolvedEmployee, caller: CallerContext | null): string[] {
  if (!isReturningCaller(caller)) return [];

  const ago = roughlyAgo(caller.lastCallAt);

  return [
    "# Who is calling",
    caller.previousCalls > 0
      ? `This number has called ${employee.businessName} before` +
        `${caller.previousCalls > 1 ? ` (${caller.previousCalls} times)` : ""}` +
        `${ago ? `, most recently ${ago}` : ""}.`
      : "This number is already on the customer list.",
    caller.name && caller.nameConfirmed
      ? `Someone at the business has confirmed this number belongs to ${caller.name}. ` +
        `You can use that name straight away.`
      : caller.name
        ? `An earlier call heard their name as ${caller.name}, but that came from speech ` +
          `recognition and nobody has checked it. Use it to greet them, and let them correct ` +
          `you — never insist on it.`
        : "Nobody has taken a name for this number yet. Ask for one if you need it.",
    caller.upcoming.length > 0
      ? `They already have booked: ` +
        caller.upcoming
          .map((b) => `${spokenDate(b.scheduledAt, employee.timezone)} under ${b.partyName ?? "no name"}`)
          .join("; ") +
        `. This was read when the call connected. Bring it up when it is relevant — do not ` +
        `recite it back at them unprompted.`
      : "They have nothing booked at the moment.",
    "One phone can be shared by a household or an office. If the caller says they are somebody",
    "else, believe them immediately: drop the name and the bookings above, and treat them as a",
    "new person.",
    "",
  ];
}

function evictStaleConversations(): void {
  const cutoff = Date.now() - CONVERSATION_TTL_MS;
  for (const [callSid, conversation] of conversations) {
    if (conversation.startedAt < cutoff) conversations.delete(callSid);
  }
}

export type StartCallContext = {
  from: string;
  to: string;
  direction?: "inbound" | "outbound";
};

/** What the webhook learned before the caller heard anything. */
export type CallRecord = {
  /** Null when the call could not be persisted — the call still goes ahead. */
  conversationId: string | null;
  /** Null for a withheld number, and for anyone ringing for the first time. */
  caller: CallerContext | null;
};

/**
 * Opens the durable `conversations` row for a call, on either transport, and
 * looks up whoever is on the other end.
 *
 * Idempotent on CallSid inside `startCall`, so a retried webhook resumes the
 * existing call rather than starting a second one. A persistence failure must
 * not drop the call, so it degrades to an unrecorded conversation — returning
 * a null id — rather than throwing at the caller.
 *
 * Filing the caller and recognising them run together rather than in
 * sequence. Everything here happens while the phone is still ringing and the
 * caller is hearing nothing, so this function's own duration is dead air; the
 * two touch the same row but neither depends on the other's result, since a
 * caller with no record yet is exactly the caller there is nothing to
 * recognise.
 */
export async function createCallRecord(
  callSid: string,
  employee: ResolvedEmployee,
  context: StartCallContext,
): Promise<CallRecord> {
  let conversationId: string;
  try {
    conversationId = await startCall({
      workspaceId: employee.workspaceId,
      aiEmployeeId: employee.employeeId,
      providerCallId: callSid,
      fromNumber: context.from,
      toNumber: context.to,
      language: env.TWILIO_SPEECH_LANGUAGE,
      ...(context.direction ? { direction: context.direction } : {}),
    });
  } catch (error) {
    console.error("[Twilio] could not record call:", error instanceof Error ? error.message : error);
    return { conversationId: null, caller: null };
  }

  // The person, not whichever end happens to be `from`: on an outbound call
  // the business dials from its own number.
  const human = callParties(context.direction, context.from, context.to).human;

  const [, caller] = await Promise.all([
    identifyCaller(employee, human, conversationId),
    recogniseCaller({
      workspaceId: employee.workspaceId,
      phone: human,
      currentConversationId: conversationId,
    }),
  ]);

  if (caller) {
    console.log(
      `[VOICE] ${callSid} recognised caller — ${caller.name ?? "no name"}` +
        `, ${caller.previousCalls} earlier call(s), ${caller.upcoming.length} booking(s)`,
    );
  }

  return { conversationId, caller };
}

/**
 * Puts the caller in the customer directory, and the call on their record.
 *
 * Runs on both transports, at the one moment the caller's number is known for
 * certain — the signed webhook. Nothing is inferred here: the number came
 * from the carrier, the language is the one we are about to speak, and a name
 * only arrives later if the caller gives one (`booking-tool.ts`).
 *
 * Best-effort by design. A directory write failing must never drop a call
 * that is ringing, so it logs and lets the conversation carry on unlinked.
 */
async function identifyCaller(
  employee: ResolvedEmployee,
  humanNumber: string | null,
  conversationId: string,
): Promise<void> {
  try {
    await rememberCaller({
      workspaceId: employee.workspaceId,
      phone: humanNumber,
      language: env.TWILIO_SPEECH_LANGUAGE,
      conversationId,
    });
  } catch (error) {
    console.error(
      "[Twilio] could not record the caller:",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Opens the durable record and the `<Gather>` loop's in-memory context
 * together, and returns what the greeting needs to know about the caller.
 */
export async function startConversation(
  callSid: string,
  employee: ResolvedEmployee,
  context: StartCallContext,
): Promise<CallerContext | null> {
  evictStaleConversations();
  const { conversationId, caller } = await createCallRecord(callSid, employee, context);
  conversations.set(callSid, {
    employee,
    caller,
    turns: [],
    startedAt: Date.now(),
    conversationId,
    tokens: NO_TOKEN_USAGE,
  });
  return caller;
}

/** `outcomeCode`: completed | no_speech | turn_limit | error */
export async function endConversation(callSid: string, outcomeCode = "completed"): Promise<void> {
  const conversation = conversations.get(callSid);
  conversations.delete(callSid);
  if (!conversation?.conversationId) return;

  try {
    // The `<Gather>` loop meters the same way the relay does. It is the
    // degradation path, not a path that gets to be free.
    await endCall(conversation.conversationId, outcomeCode, undefined, conversation.tokens);
  } catch (error) {
    console.error("[Twilio] could not finalise call:", error instanceof Error ? error.message : error);
  }
}

/** Persists what the caller said, including on calls with no model configured. */
export async function recordCallerTurn(
  callSid: string,
  text: string,
  confidence: number | null,
): Promise<void> {
  const conversation = conversations.get(callSid);
  if (!conversation?.conversationId) return;
  try {
    await recordTurn({
      conversationId: conversation.conversationId,
      speakerType: "customer",
      text,
      confidence,
    });
  } catch (error) {
    console.error("[Twilio] could not record turn:", error instanceof Error ? error.message : error);
  }
}

export type ReplyResult = { text: string; reason: "ok" | "refusal" | "truncated" | "error" };

/**
 * One conversational turn. Never throws — a phone call cannot show a stack
 * trace, so every failure becomes something sayable plus a logged error.
 */
export async function replyTo(callSid: string, spokenByCaller: string): Promise<ReplyResult> {
  const conversation = conversations.get(callSid);
  if (!conversation) {
    return { text: "Sorry, I lost track of our conversation. Could you start again?", reason: "error" };
  }

  conversation.turns.push({ role: "user", text: spokenByCaller });
  const startedAt = Date.now();

  try {
    const reply = await generateReply(
      buildSystemPrompt(conversation.employee, conversation.caller),
      conversation.turns,
    );
    // Counted before any early return: a refused or empty turn still ran
    // through the model and is still billed by whoever ran it.
    conversation.tokens = addTokenUsage(conversation.tokens, reply.usage);

    if (reply.reason === "refusal") {
      conversation.turns.pop();
      return { text: "Sorry, I can't help with that one. Is there something else I can do?", reason: "refusal" };
    }

    if (reply.text.length === 0) {
      conversation.turns.pop();
      return { text: "Sorry, I didn't catch that. Could you say it again?", reason: "error" };
    }

    conversation.turns.push({ role: "assistant", text: reply.text });

    if (conversation.conversationId) {
      try {
        await recordTurn({
          conversationId: conversation.conversationId,
          speakerType: "ai",
          text: reply.text,
          latencyMs: Date.now() - startedAt,
        });
      } catch (error) {
        console.error("[Twilio] could not record reply:", error instanceof Error ? error.message : error);
      }
    }

    return reply;
  } catch (error) {
    conversation.turns.pop();
    console.error("[Twilio] AI reply failed:", error instanceof Error ? error.message : error);
    return { text: "Sorry, I'm having trouble right now. Could you say that again?", reason: "error" };
  }
}
