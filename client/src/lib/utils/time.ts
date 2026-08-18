import { MOCK_NOW } from "@/lib/mock/fixtures";

/**
 * Time formatting.
 *
 * Everything is computed against MOCK_NOW rather than Date.now() so server and
 * client agree. When this connects to a real API, `now()` becomes Date.now()
 * and relative times move to a client-only component to avoid hydration drift.
 */

export function now(): number {
  return MOCK_NOW.getTime();
}

/** "just now", "4m", "2h", "3d" — compact enough for dense rows. */
export function relative(iso: string): string {
  const diffMs = now() - new Date(iso).getTime();
  const seconds = Math.round(diffMs / 1000);

  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
}

/**
 * "4d ago" — `relative` with the word attached, for prose.
 *
 * Its own function because the compact form has one value that already reads as
 * a complete phrase: appending "ago" to `relative()` produces "just now ago" the
 * moment something happens, which is exactly when someone is looking at it. A
 * real onboarded workspace hits that case on its first page load.
 */
export function relativeAgo(iso: string): string {
  const value = relative(iso);
  return value === "just now" ? value : `${value} ago`;
}

/** "4 minutes ago" — for tooltips and screen readers, where compact is wrong. */
export function relativeLong(iso: string): string {
  const diffMs = now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "moments ago";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 31) return `${days} days ago`;
  // Beyond a month, days stop meaning anything — "304 days ago" is a number
  // to be decoded, "10 months ago" is a fact.
  const months = Math.round(days / 30);
  if (months < 18) return months === 1 ? "1 month ago" : `${months} months ago`;
  const years = Math.round(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

/** Call durations: "1:36". Always mm:ss, so widths stay stable in a list. */
export function duration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Elapsed seconds since a start time — for live call timers. */
export function elapsedSince(iso: string): number {
  return Math.max(0, Math.floor((now() - new Date(iso).getTime()) / 1000));
}

export function clockTime(iso: string, timezone = "Europe/London"): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(iso));
}

/** "14 March 2025" — for the dates a record carries rather than events in it. */
export function longDate(iso: string, timezone = "Europe/London"): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: timezone,
  }).format(new Date(iso));
}

export function dayAndTime(iso: string, timezone = "Europe/London"): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(iso));
}

/**
 * The calendar day an instant falls on, in the workspace's timezone, as
 * "2026-08-07".
 *
 * Grouping a diary by day has to happen in the timezone the site actually
 * operates in, not the browser's: an 08:30 slot in London is the previous
 * evening in Los Angeles, and a list that silently regrouped itself because
 * someone opened it on holiday would be worse than useless. Sortable as a
 * string, which is why it is ISO order rather than a formatted date.
 */
export function dayKey(iso: string, timezone = "Europe/London"): string {
  // en-CA gives ISO-ordered parts, so no manual part assembly is needed.
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).format(new Date(iso));
}

/** "Fri 7 August" — the heading over a day's worth of rows. */
export function dayHeading(iso: string, timezone = "Europe/London"): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: timezone,
  }).format(new Date(iso));
}

/** Money in minor units → "£4.18". */
export function money(minorUnits: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(minorUnits / 100);
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
