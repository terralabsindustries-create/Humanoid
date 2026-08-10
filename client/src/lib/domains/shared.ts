/**
 * Shared helpers for the nine non-reference domain packs.
 *
 * The reference pack (hospitality) is fully hand-authored. These are
 * intentionally short — real metadata and a short onboarding, per the brief's
 * own instruction not to build ten complete products in Phase 1 — but they
 * share this generator so the simulated workspace-creation sequence still
 * reads as written for the business rather than templated.
 */
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
