import { Bot, User as UserIcon, ArrowRightLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { StatusPill, type Tone } from "@/components/primitives/status";
import {
  ACTIVITY_LABEL,
  CONTROL_LABEL,
  CONTROL_TONE,
} from "@/lib/domain/labels";
import type { AIActivity, ControlState } from "@/lib/domain/types";

/**
 * Who is in control.
 *
 * The highest-severity failure this product can have is a person believing the
 * AI is handling a call when it is not, or the reverse. So this indicator is
 * redundant by design — icon, colour and words all say the same thing — and it
 * appears on every surface where a conversation is shown.
 *
 * AI activity (listening, working, speaking) is a sub-state shown as a word and
 * a pulse, never as a different colour. Changing hue for sub-states would make
 * the AI/human distinction harder to read at a glance, which is the opposite of
 * what this component exists for.
 */

const ICON: Record<ControlState, React.ComponentType<{ className?: string }>> =
  {
    ai: Bot,
    human: UserIcon,
    transferring: ArrowRightLeft,
    ended: Check,
  };

export function ControlIndicator({
  control,
  activity,
  live = false,
  className,
}: {
  control: ControlState;
  activity?: AIActivity;
  live?: boolean;
  className?: string;
}) {
  const Icon = ICON[control];
  const tone: Tone = CONTROL_TONE[control];

  // The activity word replaces the generic label while the AI is mid-turn:
  // "Speaking" tells an operator more than "AI handling" during a live call.
  const label =
    control === "ai" && activity && activity !== "idle"
      ? ACTIVITY_LABEL[activity]
      : CONTROL_LABEL[control];

  return (
    <StatusPill
      tone={tone}
      live={live}
      icon={<Icon className="size-3 shrink-0" />}
      className={cn("gap-1", className)}
    >
      {label}
    </StatusPill>
  );
}

/**
 * Compact form for dense rows: icon plus colour, with the label available to
 * screen readers and on hover. Used where a full pill would crowd the row —
 * never where it is the only indication of control.
 */
export function ControlGlyph({
  control,
  activity,
  live = false,
  className,
}: {
  control: ControlState;
  activity?: AIActivity;
  live?: boolean;
  className?: string;
}) {
  const Icon = ICON[control];
  const tone = CONTROL_TONE[control];
  const label =
    control === "ai" && activity && activity !== "idle"
      ? `${CONTROL_LABEL[control]} — ${ACTIVITY_LABEL[activity]}`
      : CONTROL_LABEL[control];

  const colour: Record<Tone, string> = {
    ai: "text-ai bg-ai-surface",
    human: "text-human bg-human-surface",
    success: "text-success bg-success-surface",
    warning: "text-warning bg-warning-surface",
    danger: "text-danger bg-danger-surface",
    info: "text-info bg-info-surface",
    neutral: "text-muted bg-neutral-surface",
  };

  return (
    <span
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-full",
        colour[tone],
        live && "live-pulse",
        className,
      )}
      title={label}
    >
      <Icon className="size-3" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
