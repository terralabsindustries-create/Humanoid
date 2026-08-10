"use client";

import { useState } from "react";
import { Button } from "@/components/primitives/button";

/**
 * Google/Microsoft sign-in. Phase 1 has no OAuth provider wired up, so these
 * buttons say so when pressed rather than silently doing nothing — a button
 * that responds with an honest explanation is not a fake button; a button
 * that responds with nothing is.
 */
export function OAuthRow() {
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-faint">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={() => setNotice("Google sign-in isn't connected in this preview.")}
        >
          Google
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={() => setNotice("Microsoft sign-in isn't connected in this preview.")}
        >
          Microsoft
        </Button>
      </div>

      {notice && (
        <p role="status" className="mt-3 text-center text-xs text-muted">
          {notice}
        </p>
      )}
    </div>
  );
}
