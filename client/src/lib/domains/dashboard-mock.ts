import type { Tone } from "@/components/primitives/status";
import type { DomainPack } from "./types";

/**
 * The domain-adaptive dashboard's mock activity feed.
 *
 * Fixed relative-time labels rather than computed timestamps — the same
 * reasoning as `lib/mock/fixtures.ts#MOCK_NOW`, applied without a shared
 * clock: this dashboard is generated per browser session from whatever a
 * visitor answered in onboarding, so there is no single anchor instant to
 * compute "3 minutes ago" against without risking a server/client mismatch.
 * A baked-in label sidesteps the problem rather than working around it.
 */

export type ActivityEntry = {
  id: string;
  timeLabel: string;
  headline: string;
  outcomeLabel: string;
  outcomeTone: Tone;
};

const TIME_LABELS = [
  "Just now",
  "3 min ago",
  "7 min ago",
  "14 min ago",
  "22 min ago",
  "38 min ago",
  "51 min ago",
  "1 hr ago",
  "1 hr ago",
];

export function buildActivityFeed(pack: DomainPack, count = 6): ActivityEntry[] {
  return pack.dashboard.activityTemplates.slice(0, count).map((template, index) => ({
    id: template.id,
    timeLabel: TIME_LABELS[index] ?? `${(index + 1) * 15} min ago`,
    headline: template.headline,
    outcomeLabel: template.outcomeLabel,
    outcomeTone: template.outcomeTone,
  }));
}

export function formatMetricValue(value: number, format: "count" | "percent" | "currency" | "duration"): string {
  switch (format) {
    case "percent":
      return `${Math.round(value * 100)}%`;
    case "currency":
      return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
    case "duration": {
      const m = Math.floor(value / 60);
      const s = Math.floor(value % 60);
      return `${m}:${s.toString().padStart(2, "0")}`;
    }
    case "count":
    default:
      return new Intl.NumberFormat("en-GB").format(value);
  }
}
