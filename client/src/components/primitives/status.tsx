import { cn } from "@/lib/utils/cn";

/**
 * The status system.
 *
 * Colour never carries meaning alone here. Every status renders a shape, a
 * colour and a text label together, so the state survives greyscale printing,
 * colour blindness, and a glanced-at wall display across a room.
 *
 * `tone` maps to the semantic tokens in globals.css. AI and human have reserved
 * hues that no other tone uses — the question "who is in control" must never be
 * answered by a colour that also means something else.
 */

export type Tone =
  | "ai"
  | "human"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

const DOT: Record<Tone, string> = {
  ai: "bg-ai",
  human: "bg-human",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-neutral",
};

const TEXT: Record<Tone, string> = {
  ai: "text-ai",
  human: "text-human",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-muted",
};

const SURFACE: Record<Tone, string> = {
  ai: "bg-ai-surface text-ai",
  human: "bg-human-surface text-human",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
  info: "bg-info-surface text-info",
  neutral: "bg-neutral-surface text-muted",
};

export function StatusDot({
  tone,
  live = false,
  className,
}: {
  tone: Tone;
  /** Pulses. Only ever true for something genuinely happening right now. */
  live?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        DOT[tone],
        live && "live-pulse",
        className,
      )}
    />
  );
}

export function Status({
  tone,
  children,
  icon,
  live = false,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  /**
   * Replaces the dot. A dot distinguishes states by hue alone, which is exactly
   * what rule 3 forbids as the *only* channel — where a state has a shape of
   * its own, pass it here and the shape does the work the colour cannot.
   */
  icon?: React.ReactNode;
  live?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        TEXT[tone],
        className,
      )}
    >
      {icon ?? <StatusDot tone={tone} live={live} />}
      {children}
    </span>
  );
}

/** Filled variant, for rows and headers where the state must carry weight. */
export function StatusPill({
  tone,
  children,
  icon,
  live = false,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  icon?: React.ReactNode;
  live?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
        "text-2xs font-medium tracking-wide whitespace-nowrap",
        SURFACE[tone],
        className,
      )}
    >
      {icon ?? <StatusDot tone={tone} live={live} className="size-1.5" />}
      {children}
    </span>
  );
}

/** Neutral count/label chip. Not a status — carries no state meaning. */
export function Badge({
  children,
  className,
  mono = false,
}: {
  children: React.ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-subtle px-2 py-0.5",
        "text-2xs font-medium text-muted",
        mono && "font-mono tabular",
        className,
      )}
    >
      {children}
    </span>
  );
}
