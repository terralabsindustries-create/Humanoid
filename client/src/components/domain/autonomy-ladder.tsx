"use client";

import { cn } from "@/lib/utils/cn";
import { AUTONOMY_LABEL, AUTONOMY_TONE } from "@/lib/domain/labels";
import { AUTONOMY_LEVELS, type AutonomyLevel } from "@/lib/domain/types";
import type { Tone } from "@/components/primitives/status";

/**
 * Where a capability sits on the autonomy ladder.
 *
 * The five levels are ordered, and that ordering is the whole point — "asks a
 * person first" is one rung below "does it", and an owner reviewing an authority
 * matrix is judging distance from the top, not reading five unrelated states. A
 * pill per level would lose that; five rungs with the occupied one filled keeps
 * it, and the position reads at a glance across a long list of rows.
 *
 * Three channels carry the state, per rule 3: how many rungs are filled, where
 * the filled one sits, and the label beside it. The glyph alone is never the
 * answer, so it is `aria-hidden` and the text is what assistive technology gets.
 *
 * Neither reserved hue appears. `AUTONOMY_TONE` already excludes `ai` and
 * `human`: how much rope an AI employee has been given is not the same fact as
 * who is holding a live call, and the hue that answers the second must not be
 * borrowed for the first.
 */

const FILL: Record<Tone, string> = {
  ai: "bg-ai",
  human: "bg-human",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-neutral",
};

/** Rung heights, so the shape reads as a climb rather than a bar chart. */
const HEIGHT = ["h-1.5", "h-2", "h-2.5", "h-3", "h-3.5"];

export function AutonomyLadder({
  level,
  tone,
  className,
}: {
  level: AutonomyLevel;
  /** Overridden where the row's real state is not its autonomy — a hard block. */
  tone?: Tone;
  className?: string;
}) {
  const index = AUTONOMY_LEVELS.indexOf(level);
  const resolved = tone ?? AUTONOMY_TONE[level];

  return (
    <span
      aria-hidden
      className={cn("inline-flex items-end gap-[2px]", className)}
    >
      {AUTONOMY_LEVELS.map((_, rung) => (
        <span
          key={rung}
          className={cn(
            "w-[3px] rounded-full",
            HEIGHT[rung],
            rung <= index ? FILL[resolved] : "bg-line-strong opacity-50",
          )}
        />
      ))}
    </span>
  );
}

/**
 * The ladder with its label. The default rendering of an autonomy level
 * anywhere it needs to be read rather than compared.
 */
export function AutonomyBadge({
  level,
  tone,
  className,
}: {
  level: AutonomyLevel;
  tone?: Tone;
  className?: string;
}) {
  const resolved = tone ?? AUTONOMY_TONE[level];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-xs font-medium whitespace-nowrap",
        TEXT[resolved],
        className,
      )}
    >
      <AutonomyLadder level={level} tone={tone} />
      {AUTONOMY_LABEL[level]}
    </span>
  );
}

const TEXT: Record<Tone, string> = {
  ai: "text-ai",
  human: "text-human",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-muted",
};
