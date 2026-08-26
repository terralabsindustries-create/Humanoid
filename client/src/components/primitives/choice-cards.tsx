"use client";

import { motion } from "motion/react";
import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { SPRING, TRANSITION } from "@/lib/tokens/motion";

export type ChoiceCardOption = {
  id: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
  /**
   * Why this option cannot be chosen here. Set it and the card renders
   * unselectable with the reason in place of its description — never hidden,
   * per §3.11: an option removed from a list cannot be asked about, so someone
   * wondering whether it exists at all gets no answer.
   */
  unavailableReason?: string;
};

/**
 * A grid of selectable cards — the one interaction that renders
 * `single_select`, `multi_select` and `choice_cards` questions alike. The
 * three question types differ in how many answers they accept, not in how the
 * option looks or behaves, so one component serves all three rather than
 * three near-identical ones.
 */
export function ChoiceCards({
  options,
  value,
  multiple = false,
  onChange,
  columns = 2,
  size = "md",
  ariaLabel,
}: {
  options: ChoiceCardOption[];
  value: string | string[];
  multiple?: boolean;
  onChange: (value: string | string[]) => void;
  columns?: 1 | 2 | 3;
  size?: "sm" | "md";
  /** The group has no single labelable element for a `<label htmlFor>` to
   *  point to, so the question text is repeated here for assistive tech. */
  ariaLabel?: string;
}) {
  const selected = new Set(
    multiple ? (Array.isArray(value) ? value : []) : value ? [value as string] : [],
  );

  const toggle = (id: string) => {
    if (multiple) {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onChange(Array.from(next));
    } else {
      onChange(id);
    }
  };

  return (
    <div
      role={multiple ? "group" : "radiogroup"}
      aria-label={ariaLabel}
      className={cn(
        "grid gap-2.5",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-3",
      )}
    >
      {options.map((option) => {
        const isSelected = selected.has(option.id);
        const Icon = option.icon;
        const blocked = option.unavailableReason !== undefined;
        return (
          <motion.button
            key={option.id}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={isSelected}
            // Disabled rather than removed, and still reachable by a screen
            // reader through the group, so the reason is announced with the
            // option rather than the option simply not existing.
            disabled={blocked}
            onClick={() => toggle(option.id)}
            whileTap={blocked ? undefined : { scale: 0.98 }}
            transition={SPRING.press}
            className={cn(
              "group relative flex items-start gap-3 rounded-panel border p-3.5 text-left",
              "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              size === "sm" && "p-3",
              blocked
                ? "cursor-not-allowed border-line bg-subtle/50"
                : isSelected
                  ? "border-ink bg-accent-surface"
                  : "border-line-strong bg-elevated hover:bg-subtle",
            )}
          >
            {Icon && (
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  blocked ? "text-faint/60" : isSelected ? "text-ink" : "text-faint",
                )}
                aria-hidden
              />
            )}
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-sm font-medium",
                  blocked ? "text-muted" : isSelected ? "text-ink" : "text-ink/90",
                )}
              >
                {option.label}
              </span>
              {blocked ? (
                <span className="mt-0.5 block text-xs text-muted">
                  {option.unavailableReason}
                </span>
              ) : (
                option.description && (
                  <span className="mt-0.5 block text-xs text-muted">
                    {option.description}
                  </span>
                )
              )}
            </span>
            {blocked ? (
              // A stated block, not an empty slot where the control was. Text
              // as well as the muted treatment, per rule 3.
              <span className="mt-0.5 shrink-0 font-mono text-2xs tracking-wide text-faint uppercase">
                Not available
              </span>
            ) : (
              <span
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                  isSelected
                    ? "border-ink bg-ink"
                    : "border-line-strong bg-transparent",
                )}
                aria-hidden
              >
                {isSelected && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={TRANSITION.feedback}
                  >
                    <Check className="size-2.5 text-app" strokeWidth={3} />
                  </motion.span>
                )}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
