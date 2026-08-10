"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { IndustrySelector } from "@/components/onboarding/industry-selector";
import { TRANSITION } from "@/lib/tokens/motion";
import { useOnboarding } from "@/lib/store/onboarding";
import { buildProgressSteps } from "@/lib/onboarding/routing";
import { DOMAIN_PACKS, INDUSTRY_SELECTION_ORDER, getDomainPack } from "@/lib/domains/registry";
import type { IndustryPackId } from "@/lib/lexicon";
import { setIndustry as setIndustryRemote } from "@/lib/services/http/onboarding";
import { HttpError } from "@/lib/services/http/client";

const PACKS = INDUSTRY_SELECTION_ORDER.map((id) => DOMAIN_PACKS[id]);

export default function IndustrySelectionPage() {
  const router = useRouter();
  const hydrated = useOnboarding((s) => s.hydrated);
  const hydrate = useOnboarding((s) => s.hydrate);
  const snapshot = useOnboarding();
  const setIndustry = useOnboarding((s) => s.setIndustry);

  const [selected, setSelected] = useState<IndustryPackId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Adopt whatever was already chosen, once — render-time rather than an
  // effect, same reasoning as organization/page.tsx.
  const [syncedHydration, setSyncedHydration] = useState(false);
  if (hydrated && !syncedHydration) {
    setSyncedHydration(true);
    setSelected(snapshot.industry);
  }

  useEffect(() => {
    if (hydrated && !snapshot.organization.businessName.trim()) {
      router.replace("/onboarding/organization");
    }
  }, [hydrated, snapshot.organization.businessName, router]);

  if (!hydrated || !snapshot.organization.businessName.trim()) return null;

  const handleContinue = async () => {
    if (!selected) {
      setError("Choose the option closest to your business.");
      return;
    }
    if (!snapshot.workspaceId) {
      router.push("/onboarding/organization");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await setIndustryRemote(snapshot.workspaceId, selected);
      setIndustry(selected);
      router.push(`/onboarding/${getDomainPack(selected).onboardingSections[0].id}`);
    } catch (err) {
      setError(
        err instanceof HttpError
          ? err.message
          : "Couldn't save that. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const activePack = selected ? getDomainPack(selected) : null;

  return (
    <OnboardingShell
      steps={buildProgressSteps(snapshot, "organization")}
      title="What kind of business are we building Humanoid for?"
      description="This shapes everything that follows — the questions we ask, the AI employee we suggest, and the dashboard you'll land on."
      onBack={() => router.push("/onboarding/organization")}
      onContinue={handleContinue}
      continueLoading={submitting}
      wide
    >
      <IndustrySelector
        packs={PACKS}
        value={selected}
        onChange={(id) => {
          setSelected(id);
          setError(null);
        }}
      />

      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 min-h-11">
        <AnimatePresence mode="wait">
          {activePack && (
            <motion.p
              key={activePack.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={TRANSITION.fast}
              className="text-sm text-muted"
            >
              Humanoid becomes your{" "}
              <span className="font-medium text-ink">{activePack.platformName}</span>.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </OnboardingShell>
  );
}
