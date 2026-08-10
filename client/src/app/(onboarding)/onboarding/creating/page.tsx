"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { TRANSITION } from "@/lib/tokens/motion";
import { useOnboarding } from "@/lib/store/onboarding";
import { resumeHref } from "@/lib/onboarding/routing";
import { getDomainPack } from "@/lib/domains/registry";
import { completeOnboarding as completeOnboardingRemote } from "@/lib/services/http/onboarding";
import { HttpError } from "@/lib/services/http/client";
import { Button } from "@/components/primitives/button";

/** How long each simulated step is visibly "active" before completing. */
const STEP_MS = 850;
/** Pause on the final checkmark before handing off to the dashboard. */
const SETTLE_MS = 700;

/**
 * The simulated workspace-creation sequence.
 *
 * The visual sequence is simulated — there is no AI processing or knowledge
 * ingestion to wait on, and it exists so a dashboard that appears the
 * instant Review is confirmed doesn't read as though nothing was
 * configured. What happens underneath it is real, though: once the sequence
 * finishes, this calls the backend to actually create the AI employee and
 * mark onboarding complete, and a failure there is shown and retryable —
 * the animation finishing is not the same thing as the workspace existing.
 */
export default function WorkspaceCreatingPage() {
  const router = useRouter();
  const hydrated = useOnboarding((s) => s.hydrated);
  const hydrate = useOnboarding((s) => s.hydrate);
  const snapshot = useOnboarding();
  const completeOnboarding = useOnboarding((s) => s.completeOnboarding);

  const [completedCount, setCompletedCount] = useState(0);
  const [done, setDone] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    const href = resumeHref(snapshot);
    if (href !== "/onboarding/review" && href !== "/today") router.replace(href);
    // Only the guard condition, evaluated once hydration lands — re-running
    // this on every snapshot change would fight the timers below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const steps = hydrated && snapshot.industry ? getDomainPack(snapshot.industry).creationSteps : [];

  const finish = async () => {
    if (!snapshot.workspaceId || !snapshot.industry) return;
    setError(null);
    setFinishing(true);
    try {
      const roleName = getDomainPack(snapshot.industry).aiEmployeeRoleName;
      await completeOnboardingRemote(snapshot.workspaceId, roleName);
      completeOnboarding();
      setDone(true);
      router.replace("/today");
    } catch (err) {
      setError(
        err instanceof HttpError
          ? err.message
          : "Couldn't finish setting up your workspace. Check your connection and try again.",
      );
      setFinishing(false);
    }
  };

  useEffect(() => {
    if (!hydrated || steps.length === 0 || done || finishing || error) return;

    if (completedCount >= steps.length) {
      const settle = setTimeout(finish, SETTLE_MS);
      return () => clearTimeout(settle);
    }

    const timer = setTimeout(() => setCompletedCount((c) => c + 1), STEP_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, steps.length, completedCount, done, finishing, error]);

  if (!hydrated || !snapshot.industry) return null;

  const pack = getDomainPack(snapshot.industry);
  const businessName = snapshot.organization.businessName;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-app px-5 py-12">
      <div className="w-full max-w-sm">
        <p className="font-mono text-2xs tracking-wide text-faint uppercase">
          Preparing {businessName}
        </p>
        <h1 className="mt-1.5 font-display text-3xl text-ink">
          Setting up your {pack.aiEmployeeRoleName}
        </h1>

        <ul className="mt-8 space-y-3">
          {steps.map((step, index) => {
            const status =
              index < completedCount ? "done" : index === completedCount ? "active" : "pending";
            return (
              <li key={step} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border",
                    status === "done" && "border-ink bg-ink",
                    status === "active" && "border-ink bg-transparent",
                    status === "pending" && "border-line-strong bg-transparent",
                  )}
                >
                  {status === "done" && <Check className="size-3 text-app" strokeWidth={3} aria-hidden />}
                  {status === "active" && (
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                      className="size-2.5 rounded-full border-2 border-ink border-t-transparent"
                      aria-hidden
                    />
                  )}
                </span>
                <motion.span
                  initial={false}
                  animate={{ opacity: status === "pending" ? 0.45 : 1 }}
                  transition={TRANSITION.fast}
                  className={cn(
                    "text-sm",
                    status === "done" ? "text-ink" : status === "active" ? "text-ink font-medium" : "text-muted",
                  )}
                >
                  {step}
                </motion.span>
              </li>
            );
          })}
        </ul>

        {error && (
          <div className="mt-6 rounded-panel border border-line bg-danger-surface p-3.5">
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={finish} loading={finishing}>
              Try again
            </Button>
          </div>
        )}

        <span role="status" aria-live="polite" className="sr-only">
          {completedCount >= steps.length
            ? "Your workspace is ready."
            : `${steps[completedCount] ?? "Working"}…`}
        </span>
      </div>
    </div>
  );
}
