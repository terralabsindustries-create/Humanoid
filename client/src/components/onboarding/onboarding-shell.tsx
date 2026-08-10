"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ProgressRail } from "./progress-rail";
import { Button } from "@/components/primitives/button";
import { TRANSITION, OFFSET } from "@/lib/tokens/motion";
import type { ProgressStep } from "@/lib/onboarding/routing";

/**
 * The shell every onboarding screen renders inside. One layout for org setup,
 * industry selection and every domain section — screens differ only in what
 * they put in `children`, never in how progress, navigation or spacing work.
 */
export function OnboardingShell({
  steps,
  title,
  description,
  children,
  onBack,
  onContinue,
  continueLabel = "Continue",
  continueDisabled,
  continueLoading,
  wide = false,
}: {
  steps: ProgressStep[];
  title: string;
  description?: string;
  children: React.ReactNode;
  onBack?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  continueLoading?: boolean;
  /** Industry selection and review need more than the reading-column measure. */
  wide?: boolean;
}) {
  const measure = wide ? "max-w-3xl" : "max-w-xl";

  return (
    <div className="flex min-h-dvh flex-col bg-app xl:flex-row">
      <aside className="hidden w-64 shrink-0 border-r border-line px-6 py-10 xl:block">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
        >
          <span
            className="flex size-6 items-center justify-center rounded-md bg-accent text-2xs font-semibold text-accent-fg"
            aria-hidden
          >
            H
          </span>
          <span className="text-sm font-medium text-ink">Humanoid</span>
        </Link>
        <div className="mt-10">
          <ProgressRail steps={steps} />
        </div>
      </aside>

      <header className="border-b border-line px-5 py-3.5 sm:px-8 xl:hidden">
        <ProgressRail steps={steps} orientation="horizontal" />
      </header>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto px-5 py-10 sm:px-10 sm:py-14">
          <motion.div
            initial={{ opacity: 0, y: OFFSET.page }}
            animate={{ opacity: 1, y: 0 }}
            transition={TRANSITION.spatial}
            className={`mx-auto ${measure}`}
          >
            <h1 className="font-display text-3xl text-ink">{title}</h1>
            {description && (
              <p className="mt-2.5 text-md leading-relaxed text-muted">{description}</p>
            )}
            <div className="mt-8">{children}</div>
          </motion.div>
        </main>

        <footer className="border-t border-line bg-app px-5 py-4 sm:px-10">
          <div className={`mx-auto flex items-center justify-between ${measure}`}>
            {onBack ? (
              <Button variant="quiet" onClick={onBack}>
                Back
              </Button>
            ) : (
              <span />
            )}
            <Button
              variant="primary"
              onClick={onContinue}
              loading={continueLoading}
              disabled={continueDisabled}
            >
              {continueLabel}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
