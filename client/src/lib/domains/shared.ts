/**
 * Shared helpers for the nine non-reference domain packs.
 *
 * The reference pack (hospitality) is fully hand-authored. These are
 * intentionally short — real metadata and a short onboarding, per the brief's
 * own instruction not to build ten complete products in Phase 1 — but they
 * share this generator so the simulated workspace-creation sequence still
 * reads as written for the business rather than templated.
 *
 * The question-lookup helpers below serve every pack including hospitality:
 * they are how a consumer reads a stored answer back out without knowing which
 * pack asked it.
 */

import type { OnboardingQuestion } from "@/lib/onboarding/schema";
import type { DomainPack } from "./types";

export function genericCreationSteps(roleName: string): string[] {
  return [
    "Understanding your business",
    "Organizing your information",
    "Preparing knowledge",
    "Configuring workflows",
    `Setting up your ${roleName}`,
    "Preparing your workspace",
    "Finalizing",
  ];
}

/**
 * Every pack's final onboarding section ends with these three questions under
 * these exact ids (`ai_name`, `communication_style`, `escalation_triggers`).
 * The review screen, the creation sequence and the dashboard all read these
 * ids directly rather than reaching into pack-specific section shapes, which
 * is what lets one Review/Creation UI serve every industry.
 */
export const STANDARD_AI_QUESTION_IDS = {
  name: "ai_name",
  style: "communication_style",
  escalation: "escalation_triggers",
} as const;

/** A question anywhere in a pack's onboarding, by id. */
export function findPackQuestion(
  pack: DomainPack,
  questionId: string,
): OnboardingQuestion | null {
  for (const section of pack.onboardingSections) {
    const question = section.questions.find((q) => q.id === questionId);
    if (question) return question;
  }
  return null;
}

/**
 * The words a business actually saw, given the option ids its answers stored.
 *
 * The backend persists what was chosen as ids — `warm_reassuring`,
 * `emergency_pain` — because that is what a machine should store. Everywhere
 * one of those is shown back to a person it has to become the option's own
 * label again, and only the pack that asked the question knows it. Unmatched
 * ids fall through as `null` rather than as a humanised token: a pack that has
 * since dropped an option should not have the interface invent a plausible
 * label for an answer nobody can see the question for any more.
 */
export function packOptionLabels(
  pack: DomainPack,
  questionId: string,
  optionIds: string[],
): string[] {
  const question = findPackQuestion(pack, questionId);
  if (!question?.options) return [];

  return optionIds
    .map((id) => question.options?.find((option) => option.id === id)?.label ?? null)
    .filter((label): label is string => label !== null);
}

export function packOptionLabel(
  pack: DomainPack,
  questionId: string,
  optionId: string | null,
): string | null {
  if (!optionId) return null;
  return packOptionLabels(pack, questionId, [optionId])[0] ?? null;
}
