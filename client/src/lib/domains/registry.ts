import type { IndustryPackId } from "@/lib/lexicon";
import type { DomainPack } from "./types";
import { hospitalityPack } from "./hospitality";
import { healthcarePack } from "./healthcare";
import { dentalPack } from "./dental";
import { restaurantPack } from "./restaurant";
import { realEstatePack } from "./real-estate";
import { automotivePack } from "./automotive";
import { insurancePack } from "./insurance";
import { legalPack } from "./legal";
import { educationPack } from "./education";
import { otherPack } from "./other";

export type { DomainPack } from "./types";

/**
 * The domain pack registry. Every consumer — the industry selector, the
 * onboarding router, the dashboard, the shell nav — resolves a pack through
 * `getDomainPack`, never by importing an individual pack module directly. That
 * indirection is what lets a tenth pack land without touching any consumer.
 */
export const DOMAIN_PACKS: Record<IndustryPackId, DomainPack> = {
  hospitality: hospitalityPack,
  healthcare: healthcarePack,
  dental: dentalPack,
  restaurant: restaurantPack,
  realEstate: realEstatePack,
  automotive: automotivePack,
  insurance: insurancePack,
  legal: legalPack,
  education: educationPack,
  other: otherPack,
};

/** Display order for the industry-selection screen. "Other" always trails. */
export const INDUSTRY_SELECTION_ORDER: IndustryPackId[] = [
  "hospitality",
  "healthcare",
  "dental",
  "restaurant",
  "realEstate",
  "automotive",
  "insurance",
  "legal",
  "education",
  "other",
];

export function getDomainPack(id: IndustryPackId): DomainPack {
  return DOMAIN_PACKS[id];
}

/** Domain-flavored label for a nav item, falling back to the lexicon-resolved default. */
export function resolveNavLabel(
  itemId: string,
  defaultLabel: string,
  pack: DomainPack | null,
): string {
  return pack?.navLabels[itemId] ?? defaultLabel;
}
