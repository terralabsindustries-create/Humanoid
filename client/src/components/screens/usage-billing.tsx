"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Gauge, PhoneCall, Receipt, Ruler, Wallet } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import { useWorkspace } from "@/components/providers/app-providers";
import { hasCapability } from "@/lib/navigation";
import { Button } from "@/components/primitives/button";
import { EmptyState, ErrorState } from "@/components/primitives/empty-state";
import { LoadingAnnouncement, Skeleton } from "@/components/primitives/skeleton";
import { BudgetEditor, BudgetSummary, CAP_ICON } from "@/components/domain/budget-editor";
import {
  PACE_VERDICT_LABEL,
  PACE_VERDICT_TONE,
} from "@/lib/domain/labels";
import {
  currentBillingPeriod,
  paceVerdict,
  projectedMonthSpend,
  type BillingPeriod,
  type PaceVerdict,
} from "@/lib/domain/usage";
import { money, now, percent } from "@/lib/utils/time";
import type { UsageMeter, UsageSnapshot } from "@/lib/domain/types";

/**
 * Usage & billing.
 *
 * §3.12's whole claim is that cost must be visible rather than a surprise
 * waiting in an invoice, and that "what happens at the cap" is an explicit,
 * visible policy rather than a silent default. The shell's spend indicator
 * already states the number; this screen is where the policy behind it is
 * set, so the two must never disagree — both read `qk.usage`, and saving a
 * new budget here invalidates that key so the shell picks it up immediately.
 *
 * The data this screen has is one snapshot, not a list, so unlike Compliance
 * or People there is nothing to rank or filter. What it adds over the shell's
 * one-line indicator is the comparison a glance cannot make — spend against
 * how far the month has actually got — and the one control that is genuinely
 * missing from the shell: changing the budget and the behaviour at the cap.
 *
 * Where the money comes from is rendered, not assumed. A real tenant's spend
 * is metered — connected minutes and model tokens off its own calls, priced at
 * rates its operator configured — and `snapshot.meter` carries that derivation
 * so `HowThisIsMetered` can show the working. Northgate leaves `meter` null and
 * states a total the way a demo may. This is the one screen where the
 * difference between a measured number and a written-down one is the whole
 * subject, so the two are never allowed to look alike.
 */
export function UsageBilling() {
  const { user: viewer, workspace, loading: viewerLoading } = useWorkspace();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const usageQuery = useQuery({
    queryKey: qk.usage,
    queryFn: () => service.getUsage(),
  });

  const currency = workspace?.currency ?? "GBP";
  const snapshot = usageQuery.data;
  const period = useMemo(() => currentBillingPeriod(now()), []);

  const save = useMutation({
    mutationFn: (update: { budgetMonth: number | null; atCap: UsageSnapshot["atCap"] }) =>
      service.setBudget(update),
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: qk.usage });
    },
  });

  const mayManage = hasCapability(viewer?.capabilities ?? [], "billing.read");

  const failed = usageQuery.isError;
  const pending = viewerLoading || usageQuery.isPending;

  // Resolved before the capability check so a slow /me cannot flash the
  // restricted state at someone who is in fact allowed to be here.
  if (!viewerLoading && !mayManage) {
    return (
      <Page rail={null}>
        <Header />
        <Restricted />
      </Page>
    );
  }

  if (failed) {
    return (
      <Page rail={null}>
        <Header />
        <ErrorState
          title="Could not load spend"
          detail="The billing service did not respond. Nothing has changed — the budget and cap behaviour on record are unaffected. This failure is limited to reading them."
          onRetry={() => void usageQuery.refetch()}
        />
      </Page>
    );
  }

  return (
    <Page rail={pending || !snapshot ? null : <Rail snapshot={snapshot} period={period} currency={currency} />}>
      <Header snapshot={snapshot} period={period} currency={currency} />

      {pending || !snapshot ? (
        <UsageSkeleton />
      ) : (
        <>
          {snapshot.meter?.capReached && (
            <CapReached snapshot={snapshot} currency={currency} />
          )}

          <PaceSection snapshot={snapshot} period={period} currency={currency} />

          <section className="mt-10" aria-labelledby="budget-heading">
            <h2
              id="budget-heading"
              className="font-mono text-2xs tracking-wide text-faint uppercase"
            >
              Budget and the cap
            </h2>
            <p className="mt-2 max-w-prose text-sm text-muted">
              What this workspace is willing to spend in a month, and what
              happens to a caller the moment spend reaches it. Changing this
              takes effect immediately — there is no draft to publish.
            </p>

            <div className="mt-3 rounded-panel border border-line bg-elevated p-4">
              {editing ? (
                <BudgetEditor
                  budgetMonth={snapshot.budgetMonth}
                  atCap={snapshot.atCap}
                  currency={currency}
                  blocked={snapshot.capBlocked}
                  pending={save.isPending}
                  error={
                    save.isError
                      ? "That did not save. The budget is unchanged — try again."
                      : null
                  }
                  onSave={(next) => save.mutate(next)}
                  onCancel={() => {
                    save.reset();
                    setEditing(false);
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <BudgetSummary
                    budgetMonth={snapshot.budgetMonth}
                    atCap={snapshot.atCap}
                    currency={currency}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditing(true)}
                  >
                    Change
                  </Button>
                </div>
              )}
            </div>
          </section>

          {snapshot.meter && (
            <HowThisIsMetered meter={snapshot.meter} currency={currency} />
          )}

          <Footnote metered={snapshot.meter !== null} />
        </>
      )}
    </Page>
  );
}

/**
 * Left-anchored, like every other reading surface in the shell. The width
 * earned above 1280px goes to the rail's stats rather than a stretched
 * reading column.
 */
function Page({
  children,
  rail,
}: {
  children: React.ReactNode;
  rail: React.ReactNode;
}) {
  return (
    <div className="px-5 py-8 sm:px-8 sm:py-12 xl:px-10">
      <div className="flex gap-10 2xl:gap-14">
        <div className="min-w-0 max-w-[42rem] flex-1">{children}</div>
        {rail && (
          <aside className="hidden w-[19rem] shrink-0 xl:block">{rail}</aside>
        )}
      </div>
    </div>
  );
}

function Header({
  snapshot,
  period,
  currency,
}: {
  snapshot?: UsageSnapshot;
  period?: BillingPeriod;
  currency?: string;
}) {
  const verdict = snapshot && period ? paceVerdict(snapshot, period) : null;

  return (
    <header>
      <p className="font-mono text-2xs tracking-wide text-faint uppercase">
        Spend and budget
      </p>
      <h1 className="mt-1.5 font-display text-3xl text-ink">
        Usage &amp; billing
      </h1>

      {snapshot && period && currency && (
        <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">
          <span className="font-medium text-ink tabular">
            {money(snapshot.spendMonth, currency)}
          </span>{" "}
          spent this month
          {snapshot.budgetMonth !== null && (
            <>
              {" "}
              of{" "}
              <span className="font-medium text-ink tabular">
                {money(snapshot.budgetMonth, currency)}
              </span>{" "}
              budgeted
            </>
          )}
          . {verdictSentence(verdict, period)}
        </p>
      )}
    </header>
  );
}

function verdictSentence(verdict: PaceVerdict | null, period: BillingPeriod) {
  switch (verdict) {
    case "no_budget":
      return "Nothing is set to stop it — spend is tracked but no budget is in place.";
    case "over_pace":
      return `That is running ahead of pace, with ${period.daysRemaining} ${period.daysRemaining === 1 ? "day" : "days"} left in the month.`;
    case "under_pace":
      return `That is comfortably under pace, with ${period.daysRemaining} ${period.daysRemaining === 1 ? "day" : "days"} left in the month.`;
    case "on_pace":
      return "That is on pace with the budget for this point in the month.";
    default:
      return "";
  }
}

/**
 * Spend against budget, compared with how far the month has actually got —
 * the one comparison the shell's single number cannot make. Not a chart:
 * one bar, one marker, read as a sentence underneath it, in the same spirit
 * as the funnel strip on Procedures — a shape earning its place rather than
 * decoration.
 */
function PaceSection({
  snapshot,
  period,
  currency,
}: {
  snapshot: UsageSnapshot;
  period: BillingPeriod;
  currency: string;
}) {
  const verdict = paceVerdict(snapshot, period);
  const spendFraction = snapshot.budgetMonth
    ? snapshot.spendMonth / snapshot.budgetMonth
    : null;
  const timeFraction = period.dayOfMonth / period.totalDays;
  const projected = projectedMonthSpend(snapshot, period);
  const projectedOverBudget =
    snapshot.budgetMonth !== null && projected > snapshot.budgetMonth;

  return (
    <section className="mt-8" aria-labelledby="pace-heading">
      <div className="flex items-center justify-between gap-3">
        <h2
          id="pace-heading"
          className="font-mono text-2xs tracking-wide text-faint uppercase"
        >
          Pace against budget
        </h2>
        <span
          className={cn(
            "text-xs font-medium",
            PACE_VERDICT_TONE[verdict] === "warning"
              ? "text-warning"
              : PACE_VERDICT_TONE[verdict] === "success"
                ? "text-success"
                : "text-muted",
          )}
        >
          {PACE_VERDICT_LABEL[verdict]}
        </span>
      </div>

      {spendFraction !== null ? (
        <>
          <div
            className="relative mt-3 h-3 w-full overflow-hidden rounded-full bg-subtle"
            role="img"
            aria-label={`${percent(spendFraction)} of the monthly budget spent. ${percent(timeFraction)} of the month has elapsed.`}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width]",
                verdict === "over_pace"
                  ? "bg-warning"
                  : verdict === "under_pace"
                    ? "bg-success"
                    : "bg-info",
              )}
              style={{ width: `${Math.min(100, spendFraction * 100)}%` }}
            />
            <div
              className="absolute inset-y-0 w-px bg-ink/50"
              style={{ left: `${Math.min(100, timeFraction * 100)}%` }}
              title={`${period.dayOfMonth} of ${period.totalDays} days into the month`}
            />
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
            <span>{percent(spendFraction)} of budget spent</span>
            <span aria-hidden>·</span>
            <span>
              {percent(timeFraction)} of the month elapsed (marked on the bar)
            </span>
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">
          There is nothing to compare pace against until a budget is set
          below.
        </p>
      )}

      <p className="mt-3 text-sm text-muted">
        At the current rate, this month projects to{" "}
        <span
          className={cn(
            "font-medium tabular",
            projectedOverBudget ? "text-warning" : "text-ink",
          )}
        >
          {money(projected, currency)}
        </span>
        {snapshot.budgetMonth !== null && (
          <>
            {" "}
            —{" "}
            {projectedOverBudget
              ? `over the ${money(snapshot.budgetMonth, currency)} budget`
              : `within the ${money(snapshot.budgetMonth, currency)} budget`}
          </>
        )}
        . A straight line from spend so far, not a forecast.
      </p>
    </section>
  );
}

/**
 * Spend has reached the budget, and something is happening because of it.
 *
 * This is the moment the whole screen exists for, so it is stated at the top
 * rather than left to be inferred from a bar that has run out of room. What it
 * says depends on `atCap`, because "you have reached your budget" means
 * something completely different if the answer is "and calls carry on as
 * normal" versus "and the line has stopped answering" — and the second is a
 * business outage its operator needs to recognise in one read.
 */
function CapReached({
  snapshot,
  currency,
}: {
  snapshot: UsageSnapshot;
  currency: string;
}) {
  const stopped = snapshot.atCap !== "notify";
  // The icon of the behaviour that was actually chosen, so this banner and the
  // control below it cannot appear to describe two different policies.
  const Icon = CAP_ICON[snapshot.atCap];

  return (
    <div
      role="status"
      className={cn(
        "mt-6 flex items-start gap-2.5 rounded-panel border p-3.5",
        stopped ? "border-danger/40 bg-danger-surface" : "border-warning/40 bg-warning-surface",
      )}
    >
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", stopped ? "text-danger" : "text-warning")}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">
          {stopped
            ? "The budget is spent and the AI has stopped answering"
            : "The budget is spent. Calls are still being answered"}
        </p>
        <p className="mt-1 text-sm text-muted">
          {money(snapshot.spendMonth, currency)} of the{" "}
          {snapshot.budgetMonth !== null && money(snapshot.budgetMonth, currency)} budget has been
          used this month.{" "}
          {stopped
            ? "Callers are hearing that automated calls are unavailable and being asked to try another way. Raising the budget below restores the line immediately."
            : "That was the choice made here: notify and keep going. Nothing stops until the budget is lowered or the behaviour at the cap is changed."}
        </p>
      </div>
    </div>
  );
}

/**
 * The working behind the money.
 *
 * A spend figure with no derivation is a number to be believed or not, and on
 * this screen it would be a number someone might act on — pause a phone line,
 * argue with an invoice. So the units are shown next to the rates, and the
 * sentence that matters most is the last one: this is not a bill. Twilio bills
 * the telephony and the model provider bills the tokens, and neither invoice is
 * readable from inside this system. Presenting a metered estimate as an invoice
 * would be exactly the kind of plausible fabrication this codebase refuses
 * everywhere else.
 */
function HowThisIsMetered({
  meter,
  currency,
}: {
  meter: UsageMeter;
  currency: string;
}) {
  return (
    <section className="mt-10" aria-labelledby="meter-heading">
      <h2
        id="meter-heading"
        className="font-mono text-2xs tracking-wide text-faint uppercase"
      >
        How this figure is arrived at
      </h2>

      <dl className="mt-3 overflow-hidden rounded-panel border border-line bg-elevated">
        <MeterRow
          label="Connected minutes this month"
          value={`${meter.connectedMinutesMonth.toLocaleString()} min`}
          detail={`across ${meter.callsMonth.toLocaleString()} ${meter.callsMonth === 1 ? "call" : "calls"}, at ${money(meter.rates.voicePerMinute, currency)} a minute`}
        />
        <MeterRow
          label="Model tokens this month"
          value={
            meter.modelTokensMonth === null
              ? "Not counted"
              : meter.modelTokensMonth.toLocaleString()
          }
          detail={
            meter.modelTokensMonth === null
              ? "No call this month reported token counts, so the model half of this figure is missing rather than zero."
              : `at ${money(meter.rates.modelInputPerMillionTokens, currency)} per million in and ${money(meter.rates.modelOutputPerMillionTokens, currency)} per million out` +
                (meter.unmeteredCalls > 0
                  ? ` · ${meter.unmeteredCalls} ${meter.unmeteredCalls === 1 ? "call" : "calls"} went uncounted`
                  : "")
          }
        />
        <MeterRow
          label="Calls that reached an outcome"
          value={meter.resolvedCallsMonth.toLocaleString()}
          detail="what cost per resolution divides by"
        />
      </dl>

      <p className="mt-3 flex items-start gap-1.5 max-w-prose text-xs text-faint">
        <Ruler className="mt-px size-3 shrink-0" aria-hidden />
        <span>
          Minutes and tokens are measured off the calls themselves. The money is
          those measurements at the rates configured for this workspace — it is
          not an invoice. Twilio bills the telephony and the model provider
          bills the tokens, and neither bill is readable from here, so treat
          this as a close estimate rather than the amount you will be charged.
        </span>
      </p>
    </section>
  );
}

function MeterRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border-b border-line px-3.5 py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="min-w-0 text-sm text-ink">{label}</dt>
        <dd className="shrink-0 font-mono text-xs tabular text-ink">{value}</dd>
      </div>
      <p className="mt-0.5 text-xs text-muted">{detail}</p>
    </div>
  );
}

function Footnote({ metered }: { metered: boolean }) {
  return (
    <p className="mt-10 max-w-prose border-t border-line pt-5 text-sm text-muted">
      Changing the budget or the behaviour at the cap is written to the{" "}
      <Link
        href="/govern/audit"
        className={cn(
          "inline-flex items-baseline gap-0.5 font-medium text-ink underline underline-offset-4",
          "hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        )}
      >
        audit log
        <ArrowUpRight className="size-3 shrink-0 self-center" aria-hidden />
      </Link>
      , including who made it and what it was before.
      {metered && (
        <>
          {" "}
          That entry is recorded against this workspace now; the audit surface
          itself still shows demonstration events rather than reading them back,
          so it will not appear there yet.
        </>
      )}
    </p>
  );
}

function Rail({
  snapshot,
  period,
  currency,
}: {
  snapshot: UsageSnapshot;
  period: BillingPeriod;
  currency: string;
}) {
  return (
    <div className="sticky top-8 space-y-7">
      <div>
        <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
          Today
        </h2>
        <p className="mt-2 font-display text-2xl text-ink tabular">
          {money(snapshot.spendToday, currency)}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          across{" "}
          <span className="tabular">{snapshot.callsToday}</span>{" "}
          {snapshot.callsToday === 1 ? "call" : "calls"} so far
        </p>
      </div>

      <div>
        <h2 className="mb-2.5 font-mono text-2xs tracking-wide text-faint uppercase">
          This month
        </h2>
        <dl className="overflow-hidden rounded-panel border border-line bg-elevated">
          <RailRow
            icon={Wallet}
            label="Spent"
            value={money(snapshot.spendMonth, currency)}
          />
          <RailRow
            icon={Gauge}
            label="Cost per resolution"
            // An average over no resolutions is not zero — a dash says "not
            // yet", which is the true answer, where £0.00 would read as free.
            value={
              snapshot.meter && snapshot.meter.resolvedCallsMonth === 0
                ? "—"
                : money(snapshot.costPerResolution, currency)
            }
          />
          <RailRow
            icon={PhoneCall}
            label="Days left in period"
            value={String(period.daysRemaining)}
          />
        </dl>
      </div>

      <div className="flex items-start gap-1.5 text-2xs text-faint">
        <Receipt className="mt-px size-3 shrink-0" aria-hidden />
        <span>
          {snapshot.meter
            ? "Figures reset at the start of each calendar month, in this workspace's own timezone. They are metered from the calls themselves — see how the figure is arrived at, below — and are not an invoice."
            : "Figures reset at the start of each calendar month. There is no separate invoice view yet — this snapshot is the billing record until one exists."}
        </span>
      </div>
    </div>
  );
}

function RailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5 last:border-b-0">
      <dt className="flex min-w-0 items-center gap-1.5 text-xs text-ink">
        <Icon className="size-3.5 shrink-0 text-faint" aria-hidden />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="shrink-0 font-mono text-2xs tabular text-muted">
        {value}
      </dd>
    </div>
  );
}

/**
 * Not a 404 and not a shrug. The surface exists, it has contents, and the
 * viewer is not allowed to see them — the same courtesy Compliance extends.
 */
function Restricted() {
  return (
    <EmptyState
      className="mt-8"
      title="You cannot see spend and billing"
      description="This surface shows spend against budget and sets what happens at the cap, and reading it needs the billing permission. Your role does not include it. A workspace owner or governor can grant it, or answer the question for you."
    />
  );
}

function UsageSkeleton() {
  return (
    <div className="mt-8" aria-busy>
      <LoadingAnnouncement label="Loading spend" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-2/3" />
      <div className="mt-8 rounded-panel border border-line bg-elevated p-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="mt-3 h-16 w-full" />
      </div>
    </div>
  );
}
