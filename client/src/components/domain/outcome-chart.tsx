"use client";

import { useState } from "react";
import { CheckCircle2, PhoneOff, UserRound, XCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useLexicon } from "@/components/providers/app-providers";
import { count } from "@/lib/lexicon";
import { OUTCOME_LABEL, OUTCOME_TONE } from "@/lib/domain/labels";
import {
  OUTCOME_ORDER,
  formatPercent,
  share,
  type OutcomeKey,
  type OutcomeTotals,
} from "@/lib/domain/performance";
import type { Tone } from "@/components/primitives/status";
import type { PerformancePoint } from "@/lib/domain/types";

/**
 * Outcome charts.
 *
 * Two views of the same four numbers: the mix over a period, and the mix day by
 * day. They share this file because they must share their encoding — a resolved
 * call that is green in one and amber in the other is worse than either chart
 * alone.
 *
 * Colour comes from `OUTCOME_TONE`, which the rest of the product already uses
 * for these same four states. Nothing here invents a palette: an escalated call
 * is the `human` hue because a person took it, which is exactly what that
 * reserved hue is reserved to mean.
 */

/** Rule 3: every outcome carries a shape as well as a hue. */
const OUTCOME_ICON: Record<OutcomeKey, typeof CheckCircle2> = {
  resolved: CheckCircle2,
  escalated: UserRound,
  abandoned: PhoneOff,
  failed: XCircle,
};

/**
 * Tone to mark colour.
 *
 * Keyed by `Tone` rather than by outcome, and looked up through
 * `OUTCOME_TONE`, so the charts cannot drift from the colour every other
 * outcome display in the product already uses. Changing what an escalated call
 * looks like stays a one-line change in `labels.ts`.
 */
const TONE_FILL: Record<Tone, string> = {
  ai: "bg-ai",
  human: "bg-human",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-neutral",
};

const TONE_INK: Record<Tone, string> = {
  ai: "text-ai",
  human: "text-human",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-muted",
};

const fill = (key: OutcomeKey): string => TONE_FILL[OUTCOME_TONE[key]];
const ink = (key: OutcomeKey): string => TONE_INK[OUTCOME_TONE[key]];

/**
 * A diagonal hatch over the `failed` fill.
 *
 * Abandoned and failed are adjacent in every outcome display here, and their
 * tokens are the closest pair in the palette — 2.4 ΔE apart under deuteranopia
 * and only 10.4 apart with full colour vision, both below the safe floor.
 * Neither token can move: rule 2 binds them to the status palette and the whole
 * product uses them. Nor can reordering help, because these are the two worst
 * outcomes and the bar is deliberately ordered best to worst.
 *
 * So the pair is separated by texture instead of hue, which has the side
 * benefit of surviving greyscale printing and forced-colours mode. The stripe
 * is drawn in the page surface colour, so it re-themes along with everything
 * else rather than needing a light and a dark variant.
 */
const HATCH: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, transparent 0 4px, var(--surface-app) 4px 5px)",
};

function fillStyle(key: OutcomeKey): React.CSSProperties | undefined {
  return key === "failed" ? HATCH : undefined;
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  // Fixed zone so server and client render the same string, per the mock-data
  // conventions — these are date-only values and must not drift by locale.
  timeZone: "UTC",
});

function formatDay(at: string): string {
  return DAY_FORMAT.format(new Date(`${at}T00:00:00.000Z`));
}

const WEEKDAY_INITIAL = ["S", "M", "T", "W", "T", "F", "S"];

// ────────────────────────────────────────────────────────────────── mix bar

/**
 * The period's outcome mix as one bar.
 *
 * Every value is also written out in the legend beneath, so the bar is the
 * summary and the legend is the record — nothing is encoded by length or hue
 * alone.
 */
export function OutcomeMixBar({
  totals,
  className,
}: {
  totals: OutcomeTotals;
  className?: string;
}) {
  const lexicon = useLexicon();
  const sentence = OUTCOME_ORDER.filter((key) => totals[key] > 0)
    .map(
      (key) =>
        `${OUTCOME_LABEL[key]} ${totals[key]}, ${formatPercent(share(totals[key], totals.calls))}`,
    )
    .join(". ");

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={`Outcome mix across ${count(totals.calls, lexicon.call)}. ${sentence}.`}
        className="flex h-8 gap-0.5 overflow-hidden rounded-sm"
      >
        {OUTCOME_ORDER.map((key) =>
          totals[key] > 0 ? (
            <div
              key={key}
              // Grow by the count itself: the bar is the numbers, not a
              // rounded copy of them that can disagree with the legend.
              style={{ flexGrow: totals[key], ...fillStyle(key) }}
              className={cn("min-w-[2px]", fill(key))}
            />
          ) : null,
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-4">
        {OUTCOME_ORDER.map((key) => {
          const Icon = OUTCOME_ICON[key];
          return (
            <div key={key}>
              <dt className="flex items-center gap-1.5 text-xs text-muted">
                <Icon aria-hidden className={cn("size-3.5 shrink-0", ink(key))} />
                {OUTCOME_LABEL[key]}
              </dt>
              <dd className="mt-0.5 flex items-baseline gap-1.5 tabular-nums">
                <span className="text-md font-medium text-ink">
                  {formatPercent(share(totals[key], totals.calls))}
                </span>
                <span className="text-xs text-faint">{totals[key]}</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── daily columns

/**
 * Volume and mix, day by day.
 *
 * The readout above the columns is the tooltip: one fixed line that changes on
 * hover rather than a floating panel, so nothing reflows and the value being
 * read never covers the chart it came from. The full per-day numbers are in the
 * table below the chart, which is where a keyboard or screen-reader user gets
 * them — hover is the enhancement, not the only route.
 */
export function DailyOutcomeColumns({
  points,
  className,
}: {
  points: PerformancePoint[];
  className?: string;
}) {
  const lexicon = useLexicon();
  const [hovered, setHovered] = useState<number | null>(null);

  const peak = Math.max(1, ...points.map((p) => p.calls));
  const active = hovered !== null ? points[hovered] : null;
  const busiest = points.reduce(
    (best, p) => (p.calls > best.calls ? p : best),
    points[0],
  );

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-4 text-xs">
        <span className="text-muted">
          {active ? formatDay(active.at) : `${lexicon.call.many} per day`}
        </span>
        <span className="tabular-nums text-ink">
          {active
            ? `${count(active.calls, lexicon.call)} · ${formatPercent(share(active.resolved, active.calls))} resolved`
            : `Busiest ${formatDay(busiest.at)}, ${busiest.calls}`}
        </span>
      </div>

      <div
        role="img"
        aria-label={`${lexicon.call.many} per day, ${formatDay(points[0].at)} to ${formatDay(points[points.length - 1].at)}. Busiest day ${formatDay(busiest.at)} at ${count(busiest.calls, lexicon.call)}. Full figures in the table below.`}
        className="mt-2 flex h-28 items-end gap-0.5"
        onMouseLeave={() => setHovered(null)}
      >
        {points.map((point, index) => (
          <div
            key={point.at}
            className="flex h-full flex-1 items-end"
            onMouseEnter={() => setHovered(index)}
          >
            <div
              className="flex w-full flex-col-reverse gap-px"
              style={{ height: `${(point.calls / peak) * 100}%` }}
            >
              {OUTCOME_ORDER.map((key) =>
                point[key] > 0 ? (
                  <div
                    key={key}
                    style={{ flexGrow: point[key], ...fillStyle(key) }}
                    className={cn(
                      "min-h-px w-full transition-opacity",
                      fill(key),
                      hovered !== null && hovered !== index && "opacity-40",
                    )}
                  />
                ) : null,
              )}
            </div>
          </div>
        ))}
      </div>

      <div aria-hidden className="mt-1.5 flex gap-0.5">
        {points.map((point, index) => {
          const date = new Date(`${point.at}T00:00:00.000Z`);
          const tick =
            points.length <= 7
              ? WEEKDAY_INITIAL[date.getUTCDay()]
              : index % 5 === 0
                ? String(date.getUTCDate())
                : "";
          return (
            <div
              key={point.at}
              className="flex-1 text-center text-[10px] tabular-nums text-faint"
            >
              {tick}
            </div>
          );
        })}
      </div>

      <details className="mt-4 group">
        <summary className="cursor-pointer text-xs text-muted underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          View as table
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[26rem] text-left text-xs tabular-nums">
            <thead className="text-faint">
              <tr>
                <th scope="col" className="py-1 pr-3 font-normal">Day</th>
                {OUTCOME_ORDER.map((key) => (
                  <th key={key} scope="col" className="py-1 pr-3 font-normal">
                    {OUTCOME_LABEL[key]}
                  </th>
                ))}
                <th scope="col" className="py-1 font-normal">Total</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              {points.map((point) => (
                <tr key={point.at} className="border-t border-line">
                  <th scope="row" className="py-1 pr-3 font-normal text-ink">
                    {formatDay(point.at)}
                  </th>
                  {OUTCOME_ORDER.map((key) => (
                    <td key={key} className="py-1 pr-3">
                      {point[key]}
                    </td>
                  ))}
                  <td className="py-1 text-ink">{point.calls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
