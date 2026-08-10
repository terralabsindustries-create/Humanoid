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
  return days === 1 ? "yesterday" : `${days} days ago`;
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
