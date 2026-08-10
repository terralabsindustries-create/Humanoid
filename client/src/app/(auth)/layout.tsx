"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/store/auth";
import { bootstrapSession } from "@/lib/onboarding/bootstrap";

/**
 * Guards every unauthenticated screen. The local `useAuth` cache is used
 * only to decide whether it's worth *checking* — an anonymous visitor skips
 * straight to the form, no network round trip. Anyone whose cache says
 * "authenticated" gets confirmed against the real backend session before
 * being redirected away, so a stale local cache never fights a truly expired
 * server session.
 */
export default function AuthGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const hydrated = useAuth((s) => s.hydrated);
  const status = useAuth((s) => s.status);
  const hydrate = useAuth((s) => s.hydrate);
  const signOut = useAuth((s) => s.signOut);
  // Only ever set from the async callbacks below, never synchronously in the
  // effect body — when `status` isn't "authenticated" there's nothing to
  // confirm, so `ready` below is derived straight from that instead.
  const [bootstrapDone, setBootstrapDone] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated || status !== "authenticated") return;

    let cancelled = false;
    bootstrapSession()
      .then(({ authenticated, destination }) => {
        if (cancelled) return;
        if (authenticated) {
          router.replace(destination);
        } else {
          signOut();
          setBootstrapDone(true);
        }
      })
      .catch(() => {
        if (!cancelled) setBootstrapDone(true);
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, status, router, signOut]);

  const ready = hydrated && (status !== "authenticated" || bootstrapDone);
  if (!ready) return null;

  return <>{children}</>;
}
