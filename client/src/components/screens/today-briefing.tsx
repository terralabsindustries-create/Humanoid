"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Lightbulb,
  ShieldQuestion,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import { useScope } from "@/lib/store/scope";
import { useLexicon, useWorkspace } from "@/components/providers/app-providers";
import { Status, StatusPill } from "@/components/primitives/status";
import { EmptyState, ErrorState } from "@/components/primitives/empty-state";
import { Skeleton, SkeletonText } from "@/components/primitives/skeleton";
import { CAUSE_LABEL, SEVERITY_TONE } from "@/lib/domain/labels";
import { LiveConversationRow } from "@/components/domain/live-conversation-row";
import { clockTime, now,  relativeAgo } from "@/lib/utils/time";
import { lower } from "@/lib/lexicon";
import type { Briefing } from "@/lib/services";

/**
 * Today.
 *
 * An operational briefing, not a KPI grid. The question this screen answers is
 * "what happened, and what needs me" — which is prose with numbers in it, not
 * twelve cards a person has to assemble into a sentence themselves.
 *
 * Four bands, in the order a person actually needs them: what is happening now,
 * what changed since they last looked, what is waiting on them, and what is
 * worth knowing before it becomes a problem.
 */
export function TodayBriefing() {
  const scope = useScope();
  const { user } = useWorkspace();

  const briefingQuery = useQuery({
    queryKey: qk.briefing(scope),
    queryFn: () => service.getBriefing(scope),
    refetchInterval: 30_000,
  });

  if (briefingQuery.isError) {
    return (
      <Page>
        <ErrorState
          title="Could not load the briefing"
          detail="The briefing service did not respond. Live calls and conversations are unaffected — you can still open them from the live indicator above."
          onRetry={() => briefingQuery.refetch()}
        />
      </Page>
    );
  }

  const briefing = briefingQuery.data;
  const firstName = user?.name.split(" ")[0];

  return (
    <Page>
      <header className="mb-9">
        <p className="font-mono text-2xs tracking-wide text-faint uppercase">
          {new Intl.DateTimeFormat("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          }).format(new Date(briefing?.generatedAt ?? now()))}
        </p>
        <h1 className="mt-1.5 font-display text-3xl text-ink">
          {greeting(briefing?.generatedAt)}
          {firstName ? `, ${firstName}` : ""}
        </h1>
      </header>

      {briefing ? (
        <div className="space-y-10">
          <RightNow briefing={briefing} />
          <SinceYouLooked briefing={briefing} />
          <NeedsYou briefing={briefing} />
          <WorthKnowing briefing={briefing} />
        </div>
      ) : (
        <BriefingSkeleton />
      )}
    </Page>
  );
}

/**
 * Layout.
 *
 * The reading column is left-anchored rather than centred. A centred measure
 * floating in a wide pane reads as an unfinished page — it has no spine, and it
 * leaves a few hundred pixels of dead margin on each side of an operational
 * surface. Anchoring it to the same edge as the navigation gives the
 * composition a structure, and asymmetry is the point rather than a compromise.
 *
 * The prose stays at a readable measure regardless of viewport. Width earned
 * above 1280px goes to live detail, so an operator sitting on this screen can
 * see who is actually on the phone without opening anything.
 */
function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-8 sm:px-8 sm:py-12 xl:px-10">
      <div className="flex gap-10 2xl:gap-14">
        <div className="min-w-0 max-w-[46rem] flex-1">{children}</div>
        <aside className="hidden w-[19rem] shrink-0 xl:block">
          <LiveNow />
        </aside>
      </div>
    </div>
  );
}

/**
 * The live panel.
 *
 * Deliberately the same rows as the shell's live rail. This is not duplication
 * for its own sake: the rail is the peripheral signal available in every mode,
 * and this is the dwell surface where an operator actually sits. Both read the
 * same query, so they cannot disagree.
 */
function LiveNow() {
  const scope = useScope();
  const lexicon = useLexicon();

  const { data, isLoading } = useQuery({
    queryKey: qk.conversations({ live: true, scope }),
    queryFn: () => service.listConversations({ live: true, scope }),
    refetchInterval: 5_000,
  });

  const conversations = data ?? [];
  const ordered = [
    ...conversations.filter((c) => c.status === "waiting"),
    ...conversations.filter((c) => c.status === "ringing"),
    ...conversations.filter(
      (c) => c.status === "active" || c.status === "wrapping",
    ),
  ];

  return (
    <div className="sticky top-8">
      <div className="mb-3.5 flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
          Live now
        </h2>
        <Link
          href="/conversations?live=1"
          className="text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          All
        </Link>
      </div>

      <div className="overflow-hidden rounded-panel border border-line bg-elevated">
        {ordered.length > 0 ? (
          <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto">
            {ordered.map((conversation) => (
              <LiveConversationRow
                key={conversation.id}
                conversation={conversation}
                detailed
              />
            ))}
          </div>
        ) : (
          <p className="px-3 py-6 text-xs text-muted">
            {isLoading
              ? "Checking for live activity…"
              : `No ${lexicon.call.many.toLowerCase()} in progress. Incoming ${lexicon.call.many.toLowerCase()} appear here the moment they connect.`}
          </p>
        )}
      </div>
    </div>
  );
}

function Band({
  label,
  children,
  action,
}: {
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="border-t border-line pt-5">
      <div className="mb-3.5 flex items-baseline justify-between gap-4">
        <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
          {label}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Band 1 — what is happening this second. */
function RightNow({ briefing }: { briefing: Briefing }) {
  const { active, waiting, ringing, needsApproval } = briefing.live;
  const total = active + waiting + ringing;

  if (total === 0 && needsApproval === 0) {
    return (
      <Band label="Right now">
        <p className="text-md text-muted">
          Nothing live. The last call ended{" "}
          <span className="text-ink">
            {relativeAgo(briefing.generatedAt)}
          </span>
          .
        </p>
      </Band>
    );
  }

  return (
    <Band
      label="Right now"
      action={
        <Link
          href="/conversations?live=1"
          className="text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          Open live
        </Link>
      }
    >
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        {active > 0 && (
          <Figure value={active} label="in progress" tone="ai" live />
        )}
        {waiting > 0 && (
          <Figure value={waiting} label="waiting for a person" tone="warning" live />
        )}
        {ringing > 0 && <Figure value={ringing} label="ringing" tone="ai" />}
        {needsApproval > 0 && (
          <Figure
            value={needsApproval}
            label="awaiting your approval"
            tone="warning"
          />
        )}
      </div>

      {waiting > 0 && (
        <p className="mt-3.5 text-sm text-warning">
          Someone is holding. Escalations that sit unanswered are the fastest
          way to lose the trust the AI just earned.
        </p>
      )}
    </Band>
  );
}

function Figure({
  value,
  label,
  tone,
  live = false,
}: {
  value: number;
  label: string;
  tone: "ai" | "warning";
  live?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-2xl text-ink tabular">{value}</span>
        <Status tone={tone} live={live}>
          {label}
        </Status>
      </div>
    </div>
  );
}

/** Band 2 — the change since the user last looked, written as a sentence. */
function SinceYouLooked({ briefing }: { briefing: Briefing }) {
  const lexicon = useLexicon();
  const { since } = briefing;
  const delta = since.resolvedRate - since.previous.resolvedRate;
  const visits = lower(lexicon.visit.many);

  return (
    <Band label="Since you last looked">
      <p className="text-lg leading-relaxed text-ink">
        Maya handled <Num>{since.calls}</Num> calls today, booked{" "}
        <Num>{since.booked}</Num> {visits}, moved <Num>{since.rescheduled}</Num>{" "}
        and escalated <Num>{since.escalated}</Num>.
      </p>

      <p className="mt-2.5 text-md text-muted">
        {since.unresolvedEscalations > 0 ? (
          <>
            <span className="font-medium text-warning">
              {since.unresolvedEscalations}{" "}
              {since.unresolvedEscalations === 1
                ? "escalation is"
                : "escalations are"}{" "}
              still open.
            </span>{" "}
          </>
        ) : (
          <>Every escalation has been closed. </>
        )}
        Resolution is running at{" "}
        <span className="text-ink">{Math.round(since.resolvedRate * 100)}%</span>
        , {describeDelta(delta)} yesterday.
      </p>
    </Band>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-medium text-ink tabular" data-numeric>
      {children}
    </span>
  );
}

function describeDelta(delta: number): string {
  const points = Math.abs(Math.round(delta * 100));
  if (points < 1) return "level with";
  return delta > 0 ? `${points} points above` : `${points} points below`;
}

/** Band 3 — the work that is actually blocked on this person. */
function NeedsYou({ briefing }: { briefing: Briefing }) {
  const { topIssues, pendingApprovals } = briefing;

  if (topIssues.length === 0 && pendingApprovals.length === 0) {
    return (
      <Band label="Needs you">
        <EmptyState
          tone="quiet"
          title="Nothing is waiting on you"
          description="Approvals and review items appear here the moment they are raised."
        />
      </Band>
    );
  }

  return (
    <Band
      label="Needs you"
      action={
        <Link
          href="/review"
          className="text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          All review items
        </Link>
      }
    >
      <div className="space-y-px">
        {pendingApprovals.map((approval) => (
          <div
            key={approval.id}
            className="flex items-start gap-3 rounded-panel bg-warning-surface p-3.5"
          >
            <ShieldQuestion
              className="mt-0.5 size-4 shrink-0 text-warning"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{approval.label}</p>
              <dl className="mt-1.5 space-y-0.5">
                {approval.context.slice(0, 3).map((entry) => (
                  <div key={entry.label} className="flex gap-2 text-xs">
                    <dt className="w-24 shrink-0 text-faint">{entry.label}</dt>
                    <dd className="text-muted">{entry.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {/* Approvals are decided on the conversation, where the full
                context lives. Deciding from a summary is how rubber-stamping
                starts — so this leads to the call, it does not approve here. */}
            <Link
              href={`/conversations/${approval.conversationId}`}
              className={cn(
                "inline-flex h-7 shrink-0 items-center rounded-control px-2.5",
                "border border-line-strong bg-elevated text-xs font-medium text-ink",
                "transition-colors hover:bg-subtle",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              )}
            >
              Review
            </Link>
          </div>
        ))}

        {topIssues.map((issue) => (
          <Link
            key={issue.id}
            href={`/review/${issue.id}`}
            className={cn(
              "group flex items-start gap-3 rounded-panel p-3.5",
              "transition-colors hover:bg-subtle",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
            )}
          >
            <TriangleAlert
              className={cn(
                "mt-0.5 size-4 shrink-0",
                issue.severity === "critical" ? "text-danger" : "text-warning",
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-ink">{issue.title}</p>
                <StatusPill tone={SEVERITY_TONE[issue.severity]}>
                  {CAUSE_LABEL[issue.cause]}
                </StatusPill>
              </div>
              <p className="mt-1 text-xs text-muted">
                {/* Blast radius, not instance count — you fix the cause once. */}
                Affecting {issue.affectedConversationCount} conversations · last
                seen {relativeAgo(issue.lastSeenAt)}
              </p>
            </div>
            <ArrowUpRight
              className="mt-0.5 size-4 shrink-0 text-faint transition-colors group-hover:text-ink"
              aria-hidden
            />
          </Link>
        ))}
      </div>
    </Band>
  );
}

/** Band 4 — signals that are not yet problems. */
function WorthKnowing({ briefing }: { briefing: Briefing }) {
  const ICONS = {
    opportunity: Lightbulb,
    risk: TriangleAlert,
    trend: TrendingUp,
  };

  return (
    <Band label="Worth knowing">
      <ul className="space-y-3">
        {briefing.signals.map((signal) => {
          const Icon = ICONS[signal.kind];
          return (
            <li key={signal.id} className="flex items-start gap-3">
              <Icon
                className="mt-0.5 size-4 shrink-0 text-faint"
                aria-hidden
              />
              <p className="text-sm text-muted">
                {signal.href ? (
                  <Link
                    href={signal.href}
                    className="underline-offset-4 hover:text-ink hover:underline"
                  >
                    {signal.text}
                  </Link>
                ) : (
                  signal.text
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </Band>
  );
}

function BriefingSkeleton() {
  return (
    <div className="space-y-10" aria-busy>
      <span role="status" aria-live="polite" className="sr-only">
        Loading the briefing
      </span>
      {[0, 1, 2].map((band) => (
        <section key={band} className="border-t border-line pt-5">
          <Skeleton className="mb-4 h-2.5 w-24" />
          <SkeletonText lines={band === 1 ? 2 : 3} />
        </section>
      ))}
    </div>
  );
}

function greeting(iso?: string): string {
  if (!iso) return "Good day";
  const hour = Number(clockTime(iso).slice(0, 2));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
