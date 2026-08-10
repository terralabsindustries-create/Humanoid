"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/primitives/button";

/**
 * Route-level error boundary.
 *
 * States what failed, what still works, and offers a way forward. The shell
 * stays mounted around this, so live calls and the rail keep running — saying
 * so explicitly matters, because a person seeing an error screen in an
 * operations tool needs to know whether the phones are still being answered.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Real reporting goes here. Logged rather than swallowed so a failure is
    // never invisible to the team.
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:px-8 sm:py-16" role="alert">
      <p className="font-mono text-2xs tracking-wide text-faint uppercase">
        Error
      </p>
      <h1 className="mt-2 font-display text-3xl text-ink">
        This screen could not load
      </h1>
      <p className="mt-4 text-md text-muted">
        Calls are still being answered and your AI employees are unaffected —
        this failure is limited to this screen. Live activity is still visible
        from the indicator at the top of the window.
      </p>

      {error.digest && (
        <p className="mt-4 font-mono text-xs text-faint">
          Reference {error.digest}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <Link
          href="/today"
          className="inline-flex h-8 items-center rounded-control border border-line-strong bg-elevated px-3 text-sm font-medium text-ink transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Back to today
        </Link>
      </div>
    </div>
  );
}
