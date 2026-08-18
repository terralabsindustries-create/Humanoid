/**
 * Usage logic that is not a screen.
 *
 * §3.12's whole claim is that cost is visible rather than a surprise waiting
 * in an invoice — which only holds if "are we on pace" is computed once and
 * agreed everywhere it appears, the same reason `compliance.ts` centralises
 * the publish verdict. The shell's spend indicator and this screen must never
 * derive pace differently, so both call through here.
 */

import type { UsageSnapshot } from "./types";

export type BillingPeriod = {
  /** 1-indexed day of the current billing month. */
  dayOfMonth: number;
  totalDays: number;
  daysRemaining: number;
};

/** The calendar month containing `nowMs`, in UTC — mock time has no timezone of its own. */
export function currentBillingPeriod(nowMs: number): BillingPeriod {
  const date = new Date(nowMs);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const dayOfMonth = date.getUTCDate();
  const totalDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return { dayOfMonth, totalDays, daysRemaining: totalDays - dayOfMonth };
}

/**
 * A derived state rather than a stored one, so it lives with the derivation
 * instead of in the object model — see `labels.ts` for why its copy still
 * lives there.
 */
export type PaceVerdict = "no_budget" | "under_pace" | "on_pace" | "over_pace";

/**
 * How far ahead of the calendar spend is running, in percentage points.
 * Ten points of slack either way reads as "on pace" — a workspace that spends
 * unevenly through the week (arch: clinics are quiet Sundays) would otherwise
 * flicker between states on some days for no real reason.
 */
const PACE_TOLERANCE = 0.1;

export function paceVerdict(
  snapshot: UsageSnapshot,
  period: BillingPeriod,
): PaceVerdict {
  if (!snapshot.budgetMonth) return "no_budget";
  const spendFraction = snapshot.spendMonth / snapshot.budgetMonth;
  const timeFraction = period.dayOfMonth / period.totalDays;
  if (spendFraction > timeFraction + PACE_TOLERANCE) return "over_pace";
  if (spendFraction < timeFraction - PACE_TOLERANCE) return "under_pace";
  return "on_pace";
}

/**
 * A straight-line projection from spend so far to month end. Not a forecast —
 * just "if the rest of the month looks like the part that already happened",
 * which is the honest amount of confidence a linear read of seven days of
 * data deserves.
 */
export function projectedMonthSpend(
  snapshot: UsageSnapshot,
  period: BillingPeriod,
): number {
  if (period.dayOfMonth === 0) return snapshot.spendMonth;
  return Math.round(
    (snapshot.spendMonth / period.dayOfMonth) * period.totalDays,
  );
}

/**
 * "250" or "250.00" → 25000 minor units. Empty input is `null` — no budget
 * set is a valid answer the editor must be able to submit, not a parse
 * failure to swallow into 0, which would mean something else entirely (a cap
 * of nothing, tripping `atCap` on the very first call of the month).
 */
export function parseMoneyInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Minor units → "250.00", to pre-fill the editor from the stored snapshot. */
export function toMoneyInput(minorUnits: number | null): string {
  if (minorUnits === null) return "";
  return (minorUnits / 100).toFixed(2);
}
