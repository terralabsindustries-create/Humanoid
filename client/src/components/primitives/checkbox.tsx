"use client";

import { forwardRef } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * A single standalone checkbox — "I agree to the terms," not a multi-select
 * list (that's `ChoiceCards`). Built on a real `<input type="checkbox">`
 * rather than a `role="checkbox"` div, so it keeps native semantics, form
 * participation and label association for free.
 */
export const Checkbox = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <span className={cn("relative inline-flex size-4 shrink-0", className)}>
      <input
        ref={ref}
        type="checkbox"
        className="peer absolute inset-0 size-4 cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-elevated transition-colors checked:border-ink checked:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      <Check
        aria-hidden
        strokeWidth={3}
        className="pointer-events-none relative size-4 scale-0 p-0.5 text-app transition-transform peer-checked:scale-100"
      />
    </span>
  );
});
