/**
 * Channels: where a caller actually lands.
 *
 * The model splits the answer to that question across two objects. A
 * `PhoneNumber` is a way in that has been bought; a `Deployment` is an AI
 * employee's decision to answer one, with its hours and its fallback. Neither
 * alone tells anyone what happens when the phone rings — a number can be
 * marked active and assigned to an employee that has no deployment carrying
 * it, and that number rings out. So the unit this screen reasons about is the
 * *route*: the join of the two, plus the resolved consequence at a given
 * moment.
 *
 * The hours maths lives here rather than in the screen because "is it open"
 * and "when does that change" have to agree with each other, and later with
 * whatever decides to hand a real call to the fallback. Two answers to that
 * question is one more than the product can afford.
 */

import type {
  AIEmployee,
  Channel,
  FallbackBehaviour,
  OperatingHours,
  PhoneNumber,
  Scope,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Routes — the join
// ─────────────────────────────────────────────────────────────────────────────

export type ChannelRoute = {
  /** The deployment when one answers this endpoint, otherwise the number. */
  id: string;
  /**
   * Null when no deployment answers this endpoint. A number nobody has
   * deployed against has no channel, and naming one would describe a route
   * that does not exist — the card shows what the number is *capable* of
   * instead, which is a different and honest claim.
   */
  channel: Channel | null;
  endpoint: string;
  /** The number's own name — "Main patient line" — where a number backs it. */
  label: string | null;
  /** Null means the whole group rather than "unassigned". */
  locationId: string | null;
  number: PhoneNumber | null;
  employee: AIEmployee | null;
  deployment: Deployment | null;
};

type Deployment = AIEmployee["deployments"][number];

const CHANNEL_ORDER: Channel[] = [
  "voice",
  "sms",
  "whatsapp",
  "webchat",
  "email",
];

/** Endpoints compare without spacing: "+44 161 496 0114" is one number. */
function normalise(endpoint: string): string {
  return endpoint.replace(/[\s()-]/g, "").toLowerCase();
}

function channelRank(channel: Channel | null): number {
  return channel ? CHANNEL_ORDER.indexOf(channel) : CHANNEL_ORDER.length;
}

/**
 * Every way in, whether or not anything answers it.
 *
 * Both directions of the join matter and they fail differently. A deployment
 * with no matching number is an employee answering something this workspace
 * does not own; a number with no deployment is a caller hearing a line ring
 * out. Dropping either from the list would hide exactly the misconfiguration
 * this screen exists to find.
 */
export function buildRoutes(
  numbers: PhoneNumber[],
  employees: AIEmployee[],
): ChannelRoute[] {
  const byEndpoint = new Map<string, PhoneNumber>();
  for (const number of numbers) byEndpoint.set(normalise(number.e164), number);

  const routes: ChannelRoute[] = [];
  const answered = new Set<string>();

  for (const employee of employees) {
    for (const deployment of employee.deployments) {
      const number = byEndpoint.get(normalise(deployment.endpoint)) ?? null;
      if (number) answered.add(number.id);

      routes.push({
        id: deployment.id,
        channel: deployment.channel,
        endpoint: deployment.endpoint,
        label: number?.label ?? null,
        // The deployment's own site wins over the number's: the deployment is
        // the thing that actually answers, so it is the thing that decides
        // which site this route belongs to.
        locationId: deployment.locationId ?? number?.locationId ?? null,
        number,
        employee,
        deployment,
      });
    }
  }

  for (const number of numbers) {
    if (answered.has(number.id)) continue;
    routes.push({
      id: number.id,
      channel: null,
      endpoint: number.e164,
      label: number.label,
      locationId: number.locationId,
      number,
      employee: employees.find((e) => e.id === number.employeeId) ?? null,
      deployment: null,
    });
  }

  return routes.sort((a, b) => {
    // A way in that nothing answers is broken at every hour of the day, so it
    // leads. Ranking the rest by whether the AI or the fallback has it right
    // now would reshuffle the whole list at 18:30 for no reason — being on a
    // fallback path overnight is the configuration working, not a fault.
    const byGap =
      Number(a.deployment !== null) - Number(b.deployment !== null);
    if (byGap !== 0) return byGap;

    const byEndpoint = a.endpoint.localeCompare(b.endpoint);
    if (byEndpoint !== 0) return byEndpoint;

    return channelRank(a.channel) - channelRank(b.channel);
  });
}

/**
 * Scope, with the one rule that is specific to channels: a route with no site
 * belongs to the whole group and stays visible under every site scope, because
 * a group number really does ring for that site. Filtering it out would leave
 * a site manager looking at an empty screen and conclude nothing answers.
 */
export function routesInScope(
  routes: ChannelRoute[],
  scope: Scope,
): ChannelRoute[] {
  if (!scope.locationId) return routes;
  return routes.filter(
    (route) =>
      route.locationId === null || route.locationId === scope.locationId,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reach — what a caller gets right now
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deliberately three outcomes rather than a boolean. "Reaching the fallback"
 * is a working configuration at 21:00 and a fault at 11:00, and "reaching
 * nobody" is never acceptable at any hour — collapsing the last two into
 * "not answered by the AI" is what lets a dead number sit unnoticed in a
 * settings table for a month.
 */
export type RouteReach =
  | { lands: "ai" }
  | { lands: "fallback"; because: "out_of_hours" | "paused" | "not_live" }
  | { lands: "nobody"; because: "no_channel" | "no_employee" | "provisioning" };

export function resolveReach(
  route: ChannelRoute,
  at: Date,
  timeZone: string,
): RouteReach {
  // A number still being provisioned cannot receive anything yet, whatever is
  // configured behind it.
  if (route.number?.status === "provisioning") {
    return { lands: "nobody", because: "provisioning" };
  }

  if (!route.deployment) {
    return {
      lands: "nobody",
      because: route.employee ? "no_channel" : "no_employee",
    };
  }

  const status = route.employee?.status;
  if (status === "paused") return { lands: "fallback", because: "paused" };
  if (status === "draft" || status === "scheduled") {
    return { lands: "fallback", because: "not_live" };
  }

  // "degraded" still answers. It is a quality problem, not a routing one, and
  // saying otherwise here would send someone looking for a fallback fault
  // that does not exist.
  if (!isOpenAt(route.deployment.hours, at, timeZone)) {
    return { lands: "fallback", because: "out_of_hours" };
  }

  return { lands: "ai" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Operating hours
// ─────────────────────────────────────────────────────────────────────────────

const WEEK = 7 * 1440;

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function toMinutes(clock: string): number {
  const [hour, minute] = clock.split(":");
  return Number(hour) * 60 + Number(minute);
}

function toClock(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(wrapped / 60);
  return `${String(hour).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

/**
 * Minutes since local Sunday 00:00, in the site's own timezone.
 *
 * Hours are wall-clock strings against the site, not the browser: 08:00 at a
 * Manchester practice is 08:00 there whoever is looking, and a screen that
 * quietly answered in the viewer's timezone would tell someone on holiday
 * that their own phones were closed.
 */
export function weekMinute(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);

  const part = (type: string) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";

  const weekday = WEEKDAY_INDEX[part("weekday")] ?? 0;
  // Some engines render midnight as "24" under hour12: false.
  const hour = Number(part("hour")) % 24;

  return weekday * 1440 + hour * 60 + Number(part("minute"));
}

type Window = { start: number; end: number };

function weekWindows(hours: OperatingHours): Window[] {
  const windows: Window[] = [];

  for (const [key, window] of Object.entries(hours.days)) {
    if (!window) continue;
    const day = Number(key);
    const start = day * 1440 + toMinutes(window.open);
    let end = day * 1440 + toMinutes(window.close);
    // A close at or before the open runs past midnight: a front desk open
    // 22:00–02:00 is one window, not two.
    if (end <= start) end += 1440;
    windows.push({ start, end });
  }

  return windows.sort((a, b) => a.start - b.start);
}

export function isOpenAt(
  hours: OperatingHours,
  at: Date,
  timeZone: string,
): boolean {
  if (hours.alwaysOn) return true;

  const minute = weekMinute(at, timeZone);
  return weekWindows(hours).some(
    (window) =>
      (minute >= window.start && minute < window.end) ||
      // A Saturday-night window running into Sunday wraps past the end of the
      // week, so early Sunday has to be tested a week later as well.
      (minute + WEEK >= window.start && minute + WEEK < window.end),
  );
}

export type HoursChange = {
  /** Minutes from now. */
  inMinutes: number;
  /** True when the AI starts answering; false when it hands over. */
  opens: boolean;
  /** Local wall clock, "17:00". */
  clock: string;
  /** Local day, "Friday". */
  day: string;
  /** Whether the change falls on the local day it is being read on. */
  today: boolean;
};

/**
 * The next time this route changes hands.
 *
 * This is the fact nobody can work out from a table of opening hours in their
 * head, and it is the one people actually ask for: what happens at 19:40.
 *
 * The arithmetic is wall-clock, so a daylight-saving shift falling inside the
 * countdown moves the answer by an hour. Correcting for that needs a real
 * timezone library; being an hour out twice a year on a countdown is a fair
 * price, and the clock time it names stays right either way.
 */
export function nextHoursChange(
  hours: OperatingHours,
  at: Date,
  timeZone: string,
): HoursChange | null {
  if (hours.alwaysOn) return null;

  const windows = weekWindows(hours);
  if (windows.length === 0) return null;

  const minute = weekMinute(at, timeZone);
  let next: HoursChange | null = null;

  for (const window of windows) {
    const boundaries: [number, boolean][] = [
      [window.start, true],
      [window.end, false],
    ];

    for (const [boundary, opens] of boundaries) {
      const delta = (((boundary - minute) % WEEK) + WEEK) % WEEK;
      // A boundary falling exactly now is the one just passed, not the one
      // coming: the next of those is a week away.
      const inMinutes = delta === 0 ? WEEK : delta;
      if (next && next.inMinutes <= inMinutes) continue;

      const local = ((boundary % WEEK) + WEEK) % WEEK;
      const day = Math.floor(local / 1440) % 7;

      next = {
        inMinutes,
        opens,
        clock: toClock(local),
        day: DAY_LONG[day],
        today: day === Math.floor(minute / 1440),
      };
    }
  }

  return next;
}

/**
 * Opening hours as the few lines a person would actually write them on a
 * door: consecutive days sharing a window collapse into a range. Seven rows
 * of "08:00–18:30" is a table nobody reads; "Mon–Thu 08:00–18:30" is a fact.
 */
export function summariseHours(hours: OperatingHours): string[] {
  if (hours.alwaysOn) return ["Always on"];

  const week = [1, 2, 3, 4, 5, 6, 0];
  if (week.every((day) => !hours.days[day])) return ["Never open"];

  const groups: { days: number[]; window: { open: string; close: string } | null }[] =
    [];

  for (const day of week) {
    const window = hours.days[day] ?? null;
    const last = groups.at(-1);
    const continues =
      last &&
      (last.window === null
        ? window === null
        : window !== null &&
          last.window.open === window.open &&
          last.window.close === window.close);

    if (continues) last.days.push(day);
    else groups.push({ days: [day], window });
  }

  return groups.map((group) => {
    const span =
      group.days.length === 1
        ? DAY_SHORT[group.days[0]]
        : `${DAY_SHORT[group.days[0]]}–${DAY_SHORT[group.days.at(-1)!]}`;

    return group.window
      ? `${span} ${group.window.open}–${group.window.close}`
      : `${span} closed`;
  });
}

/** "6h 18m" — a countdown, so it stays coarse rather than false-precise. */
export function untilLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  }

  const days = Math.round(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A fallback said as what the caller gets, not as what was configured.
 * "Forwards the caller" and "to +44 161 496 0100" are separated so the
 * destination can be rendered as the phone number it is — mono, tabular, and
 * checkable against the one on the wall.
 */
export function describeFallback(fallback: FallbackBehaviour): {
  headline: string;
  detail: string | null;
} {
  switch (fallback.kind) {
    case "forward":
      return { headline: "Forwards the caller", detail: fallback.to };
    case "announce":
      return {
        headline: "Plays a recorded message",
        detail: fallback.message,
      };
    case "voicemail":
      return { headline: "Takes a voicemail", detail: null };
  }
}
