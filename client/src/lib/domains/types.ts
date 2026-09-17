import type { LucideIcon } from "lucide-react";
import type { IndustryPackId } from "@/lib/lexicon";
import type { OnboardingSection } from "@/lib/onboarding/schema";
import type { Tone } from "@/components/primitives/status";

/**
 * The domain pack — Layer 3 of the adaptation model in
 * interface-architecture.md §9 ("industry pack: data + content"), made
 * concrete for onboarding and the dashboard.
 *
 * A domain pack is pure configuration. Nothing in this file or in any consumer
 * of `DomainPack` may branch on an industry id — the pack IS the branch,
 * resolved once at lookup time. See `registry.ts`.
 *
 * Hospitality is the reference implementation and is fully authored. The
 * remaining nine packs carry real metadata and a short onboarding, proving the
 * architecture without ten fully-built verticals — see §26 of the brief this
 * was built against.
 */

export type DashboardMetricFormat = "count" | "percent" | "currency" | "duration";

export type DashboardMetric = {
  id: string;
  label: string;
  icon: LucideIcon;
  format: DashboardMetricFormat;
  /**
   * A fixed, realistic figure — this is Phase 1 mock data, static like the
   * rest of the product's fixtures (see `lib/mock/fixtures.ts#MOCK_NOW`),
   * not a randomised placeholder. When live data lands, this becomes a query
   * result; the shape a screen reads does not change.
   */
  value: number;
  tone?: Tone;
};

export type QuickAction = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Where this would take the user once the surface is built. */
  href: string;
};

export type SuggestedIntegration = {
  id: string;
  name: string;
  description: string;
};

/**
 * One template for a live-activity entry.
 *
 * No longer rendered. The dashboard's "what your AI employee is doing" band
 * reads the tenant's real calls (`dashboard-activity.ts`) — authored samples
 * there would be a dashboard inventing its own history, on the one screen
 * whose entire claim is "this is what happened here". Kept because a
 * pre-onboarding preview is the one place sample activity would be honest;
 * delete it rather than wiring it back into the live dashboard.
 */
export type ActivityTemplate = {
  id: string;
  headline: string;
  outcomeLabel: string;
  outcomeTone: Tone;
};

export type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  severity: "high" | "medium";
};

export type DomainDashboardConfig = {
  /** "Business status" band — the headline figures for this vertical. */
  primaryMetrics: DashboardMetric[];
  /** Not rendered on the live dashboard — see `ActivityTemplate`. */
  activityTemplates: ActivityTemplate[];
  /** "What needs human attention" band. Kept short and specific, not generic. */
  attentionItems: AttentionItem[];
  /** "Business insights" band — short, mock-authored sentences. */
  insights: string[];
};

export type DomainPack = {
  id: IndustryPackId;
  name: string;
  /** "AI Hospitality Operations Platform" — used on the industry-selector card and marketing chrome. */
  platformName: string;
  tagline: string;
  icon: LucideIcon;
  aiEmployeeRoleName: string;
  aiEmployeeNamePlaceholder: string;
  onboardingIntro: { title: string; description: string };
  onboardingSections: OnboardingSection[];
  /** Nav item id → domain-flavored label, layered over the lexicon-resolved default. */
  navLabels: Partial<Record<string, string>>;
  quickActions: QuickAction[];
  suggestedIntegrations: SuggestedIntegration[];
  dashboard: DomainDashboardConfig;
  /** The simulated workspace-creation sequence, in order. */
  creationSteps: string[];
};
