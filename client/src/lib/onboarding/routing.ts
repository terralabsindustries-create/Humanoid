import { getDomainPack } from "@/lib/domains/registry";
import type { OnboardingSnapshot } from "@/lib/store/onboarding";

/**
 * Where onboarding resumes.
 *
 * Every onboarding route calls this on mount to check it is the *right*
 * place for this visitor to be — landing on `/onboarding/ai_concierge`
 * directly (a bookmark, a refresh, a back button after switching industry)
 * with no industry chosen yet has to recover gracefully, not render a blank
 * section.
 */
export function resumeHref(snapshot: OnboardingSnapshot | null): string {
  if (!snapshot) return "/onboarding/organization";
  if (snapshot.completed) return "/today";
  if (!snapshot.organization.businessName.trim()) return "/onboarding/organization";
  if (!snapshot.industry) return "/onboarding/industry";

  const pack = getDomainPack(snapshot.industry);
  const nextSection = pack.onboardingSections.find(
    (section) => !snapshot.completedSectionIds.includes(section.id),
  );
  return nextSection ? `/onboarding/${nextSection.id}` : "/onboarding/review";
}

export type ProgressStepStatus = "done" | "current" | "upcoming";

export type ProgressStep = {
  id: string;
  label: string;
  status: ProgressStepStatus;
};

/**
 * The progress rail's steps: a synthetic "Business" step for org setup, one
 * step per section in the selected pack, then "Review". Meaningful section
 * names rather than "Question 12 of 40" — see the spec this was built against.
 */
export function buildProgressSteps(
  snapshot: OnboardingSnapshot,
  currentStepId: string,
): ProgressStep[] {
  const steps: ProgressStep[] = [
    {
      id: "organization",
      label: "Business",
      status:
        currentStepId === "organization"
          ? "current"
          : snapshot.organization.businessName.trim()
            ? "done"
            : "upcoming",
    },
  ];

  if (snapshot.industry) {
    const pack = getDomainPack(snapshot.industry);
    for (const section of pack.onboardingSections) {
      steps.push({
        id: section.id,
        label: section.progressLabel,
        status:
          section.id === currentStepId
            ? "current"
            : snapshot.completedSectionIds.includes(section.id)
              ? "done"
              : "upcoming",
      });
    }
  }

  steps.push({
    id: "review",
    label: "Review",
    status:
      currentStepId === "review"
        ? "current"
        : snapshot.completed
          ? "done"
          : "upcoming",
  });

  return steps;
}
