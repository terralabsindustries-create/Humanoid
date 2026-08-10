"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { bootstrapSession } from "@/lib/onboarding/bootstrap";

/**
 * Entry point.
 *
 * A marketing landing page is explicitly out of scope for this build (see
 * `CLAUDE.md`) — this only has to decide where a visitor belongs. That
 * decision is backend-authoritative (`bootstrapSession`): signed out goes to
 * login, mid-onboarding resumes exactly where the server says it left off,
 * and a completed workspace goes straight to its dashboard.
 */
export default function Root() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    bootstrapSession()
      .then(({ destination }) => {
        if (!cancelled) router.replace(destination);
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
