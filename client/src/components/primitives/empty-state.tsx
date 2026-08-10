import { cn } from "@/lib/utils/cn";

/**
 * Empty states.
 *
 * Day one is the hardest moment in this product: no calls, no history, nothing
 * to look at. An empty state that shrugs loses the user there. Each one says
 * what this surface will hold, why it is empty right now, and the single action
 * that fills it — and it says so in editorial type, because these are among the
 * few places the display face is allowed.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
  tone = "neutral",
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
  /** "quiet" for expected emptiness (no live calls at 3pm on a Sunday). */
  tone?: "neutral" | "quiet";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start justify-center py-10",
        tone === "quiet" ? "px-0" : "px-1",
        className,
      )}
    >
      <p
        className={cn(
          "font-display text-ink",
          tone === "quiet" ? "text-lg" : "text-xl",
        )}
      >
        {title}
      </p>
      <p className="mt-1.5 max-w-prose text-sm text-muted">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * Error state. Says what failed, what still works, and offers a retry. Never
 * "Something went wrong" — that tells the user nothing and erodes trust in
 * everything else on the screen.
 */
export function ErrorState({
  title,
  detail,
  onRetry,
  className,
}: {
  title: string;
  detail: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("py-8", className)} role="alert">
      <p className="text-md font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-prose text-sm text-muted">{detail}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 text-sm font-medium text-ink underline underline-offset-4 hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
