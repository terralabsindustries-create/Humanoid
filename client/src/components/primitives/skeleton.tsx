import { cn } from "@/lib/utils/cn";

/**
 * Skeletons are used only where they genuinely help: when the shape of the
 * result is known and stable, so the placeholder prevents a layout jump. For
 * anything whose size is unpredictable, a quiet inline state beats a shimmering
 * block that turns out to be the wrong size.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      // Not announced: a screen reader should hear the result, not the wait.
      aria-hidden
      className={cn("animate-pulse rounded bg-subtle", className)}
      {...props}
    />
  );
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3.5"
          style={{ width: i === lines - 1 ? "62%" : "100%" }}
        />
      ))}
    </div>
  );
}

/** Live regions announce loading once, rather than on every skeleton block. */
export function LoadingAnnouncement({ label }: { label: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {label}
    </span>
  );
}
