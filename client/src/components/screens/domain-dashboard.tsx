"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useOnboarding } from "@/lib/store/onboarding";
import { getDomainPack } from "@/lib/domains/registry";
import { buildActivityFeed, formatMetricValue } from "@/lib/domains/dashboard-mock";
import { STANDARD_AI_QUESTION_IDS } from "@/lib/domains/shared";
import { Status, StatusPill } from "@/components/primitives/status";
import { EmptyState } from "@/components/primitives/empty-state";

/**
 * The domain-adaptive dashboard.
 *
 * This is the payoff of the whole onboarding flow: the same four bands as
 * every operational briefing in this product (business status → what the AI
 * is doing → what needs a person → what's worth knowing), but every metric,
 * every activity template and every quick action came from `DomainPack`
 * configuration, not from a branch on which industry this is. Swap the pack
 * and the screen is instantly a different vertical's dashboard — nothing here
 * changes.
 */
export function DomainDashboard() {
  const hydrated = useOnboarding((s) => s.hydrated);
  const hydrate = useOnboarding((s) => s.hydrate);
  const snapshot = useOnboarding();

  // `TodayRouter` decides *whether* to render this component from a direct
  // localStorage read (`useSyncExternalStore`, safe on a hard reload with no
  // hydration step of its own). This component reads the same data through
  // the zustand store instead, which starts empty on every fresh page load
  // until something calls `hydrate()` — nothing upstream does that for
  // `/today`, so it has to happen here, or a hard reload lands on a
  // correctly-routed but silently blank page.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!hydrated || !snapshot.industry) return null;

  const pack = getDomainPack(snapshot.industry);
  const businessName = snapshot.organization.businessName || pack.name;
  const aiName =
    (snapshot.answers[STANDARD_AI_QUESTION_IDS.name] as string) || pack.aiEmployeeNamePlaceholder;
  const activity = buildActivityFeed(pack);

  return (
    <div className="px-5 py-8 sm:px-8 sm:py-12 xl:px-10">
      <div className="flex gap-10 2xl:gap-14">
        <div className="min-w-0 max-w-[52rem] flex-1">
          <header className="mb-9">
            <p className="flex items-center gap-1.5 font-mono text-2xs tracking-wide text-ai uppercase">
              <Sparkles className="size-3" aria-hidden />
              {pack.aiEmployeeRoleName} live
            </p>
            <h1 className="mt-1.5 font-display text-3xl text-ink">
              {aiName} is ready to help {businessName}&apos;s{" "}
              {pack.id === "hospitality" || pack.id === "restaurant" ? "guests" : "customers"}.
            </h1>
          </header>

          <div className="space-y-10">
            <Band label="Business status">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {pack.dashboard.primaryMetrics.map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <div
                      key={metric.id}
                      className="rounded-panel border border-line bg-elevated p-3.5"
                    >
                      <Icon
                        className={cn(
                          "size-4",
                          metric.tone === "warning" ? "text-warning" : "text-faint",
                        )}
                        aria-hidden
                      />
                      <p className="mt-2.5 font-display text-2xl text-ink tabular">
                        {formatMetricValue(metric.value, metric.format)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">{metric.label}</p>
                    </div>
                  );
                })}
              </div>
            </Band>

            <Band label={`What ${pack.aiEmployeeRoleName} is doing`}>
              <div className="overflow-hidden rounded-panel border border-line bg-elevated">
                {activity.map((entry, index) => (
                  <div
                    key={entry.id}
                    className={cn(
                      "flex items-start justify-between gap-4 px-3.5 py-3",
                      index > 0 && "border-t border-line",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-ink">{entry.headline}</p>
                      <p className="mt-1 font-mono text-2xs text-faint">{entry.timeLabel}</p>
                    </div>
                    <StatusPill tone={entry.outcomeTone} className="shrink-0">
                      {entry.outcomeLabel}
                    </StatusPill>
                  </div>
                ))}
              </div>
            </Band>

            <Band label="Needs your attention">
              {pack.dashboard.attentionItems.length === 0 ? (
                <EmptyState
                  tone="quiet"
                  title="Nothing needs you right now"
                  description="Anything that needs a person will appear here the moment it happens."
                />
              ) : (
                <div className="space-y-px">
                  {pack.dashboard.attentionItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 rounded-panel bg-warning-surface p-3.5"
                    >
                      <TriangleAlert
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          item.severity === "high" ? "text-danger" : "text-warning",
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">{item.title}</p>
                        <p className="mt-1 text-xs text-muted">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Band>

            <Band label="Worth knowing">
              <ul className="space-y-2.5">
                {pack.dashboard.insights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-muted">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-faint" aria-hidden />
                    {insight}
                  </li>
                ))}
              </ul>
            </Band>
          </div>
        </div>

        <aside className="hidden w-[19rem] shrink-0 xl:block">
          <div className="sticky top-8 space-y-8">
            <div>
              <h2 className="mb-3 font-mono text-2xs tracking-wide text-faint uppercase">
                Quick actions
              </h2>
              <div className="space-y-1.5">
                {pack.quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link
                      key={action.id}
                      href={action.href}
                      className={cn(
                        "flex items-start gap-2.5 rounded-panel border border-line bg-elevated p-3",
                        "transition-colors hover:bg-subtle",
                      )}
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink">
                          {action.label}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {action.description}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {pack.suggestedIntegrations.length > 0 && (
              <div>
                <h2 className="mb-3 font-mono text-2xs tracking-wide text-faint uppercase">
                  Suggested integrations
                </h2>
                <div className="space-y-1.5">
                  {pack.suggestedIntegrations.map((integration) => (
                    <div
                      key={integration.id}
                      className="rounded-panel border border-line bg-elevated p-3"
                    >
                      <p className="text-sm font-medium text-ink">{integration.name}</p>
                      <p className="mt-0.5 text-xs text-muted">{integration.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Status tone="ai">Simulated data — Phase 1 preview</Status>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Band({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-5">
      <h2 className="mb-3.5 font-mono text-2xs tracking-wide text-faint uppercase">{label}</h2>
      {children}
    </section>
  );
}
