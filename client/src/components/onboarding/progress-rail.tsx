import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ProgressStep } from "@/lib/onboarding/routing";

/**
 * "✓ Business / ✓ Property / ● Guest Experience / ○ Reservations…" — section
 * names rather than "Question 12 of 40". A person can see the whole shape of
 * what's left without knowing how many fields are inside each section, which
 * is the actual anxiety a raw counter tries and fails to resolve.
 */
export function ProgressRail({
  steps,
  orientation = "vertical",
}: {
  steps: ProgressStep[];
  orientation?: "vertical" | "horizontal";
}) {
  if (orientation === "horizontal") {
    const doneCount = steps.filter((s) => s.status === "done").length;
    const current = steps.find((s) => s.status === "current");
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-ink">{current?.label}</span>
          <span className="text-faint tabular">
            {doneCount + (current ? 1 : 0)} / {steps.length}
          </span>
        </div>
        <div className="flex h-1 gap-1">
          {steps.map((step) => (
            <span
              key={step.id}
              className={cn(
                "h-full flex-1 rounded-full transition-colors",
                step.status === "upcoming" ? "bg-subtle" : "bg-ink",
              )}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ol className="space-y-0.5">
      {steps.map((step) => (
        <li key={step.id} className="flex items-center gap-2.5 py-1">
          <span
            aria-hidden
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded-full border",
              step.status === "done" && "border-ink bg-ink",
              step.status === "current" && "border-ink bg-transparent",
              step.status === "upcoming" && "border-line-strong bg-transparent",
            )}
          >
            {step.status === "done" && (
              <Check className="size-2.5 text-app" strokeWidth={3} />
            )}
            {step.status === "current" && (
              <span className="size-1.5 rounded-full bg-ink" />
            )}
          </span>
          <span
            className={cn(
              "text-sm",
              step.status === "current" && "font-medium text-ink",
              step.status === "done" && "text-ink",
              step.status === "upcoming" && "text-faint",
            )}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
