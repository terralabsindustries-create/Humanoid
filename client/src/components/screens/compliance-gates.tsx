"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import { useLexicon, useWorkspace } from "@/components/providers/app-providers";
import { hasCapability } from "@/lib/navigation";
import { EmptyState, ErrorState } from "@/components/primitives/empty-state";
import { LoadingAnnouncement, Skeleton } from "@/components/primitives/skeleton";
import { Status } from "@/components/primitives/status";
import { ComplianceGateRow } from "@/components/domain/compliance-gate-row";
import {
  gatesByOwner,
  oldestReview,
  rankGates,
  retentionLabel,
  summariseGates,
  type GateSummary,
} from "@/lib/domain/compliance";
import { lower } from "@/lib/lexicon";
import { relativeLong } from "@/lib/utils/time";
import type {
  ComplianceGate,
  RetentionPolicy,
  User,
} from "@/lib/domain/types";

/**
 * Compliance.
 *
 * The organising decision is in the registry entry and the whole screen is
 * arranged to honour it: these are *gates that block a deployment*, not
 * settings that can be skipped. Two things follow.
 *
 * First, nothing is hidden. There is no status filter here, unlike Review's
 * queue — a compliance surface that defaults to showing only outstanding work
 * answers "what is broken" but destroys the question this screen is actually
 * opened for, which is "can I demonstrate that all of this was considered?".
 * Met gates stay on the page, ruled-out ones stay on the page and say they were
 * ruled out, and the ranking rather than the filtering puts the work on top.
 *
 * Second, nothing here writes. A gate is not cleared by ticking it — it is
 * cleared by fixing the thing underneath it, and a "mark as compliant" control
 * would turn this straight back into the settings pane it is defined against.
 * So each gate names its owner and states its requirement as an instruction,
 * and the one gate whose subject *is* on this page — retention — quotes the
 * live policy figure directly beneath it, so the argument and the number it is
 * arguing about can never drift apart.
 *
 * The capability check is a real gate rather than a courtesy. Elsewhere in the
 * shell (People & roles) the screen renders for everyone and locks the controls
 * with a reason, because reading who is on call helps anyone who might escalate.
 * `compliance.read` is not that: it is literally "see compliance gates", so a
 * viewer without it gets told the surface exists and who to ask, not the
 * contents.
 */
export function ComplianceGates() {
  const { user: viewer, loading: viewerLoading } = useWorkspace();

  const gatesQuery = useQuery({
    queryKey: qk.complianceGates,
    queryFn: () => service.listComplianceGates(),
  });
  const retentionQuery = useQuery({
    queryKey: qk.retention,
    queryFn: () => service.listRetentionPolicies(),
  });
  const usersQuery = useQuery({
    queryKey: qk.users,
    queryFn: () => service.listUsers(),
  });

  const gates = useMemo(() => gatesQuery.data ?? [], [gatesQuery.data]);
  const policies = useMemo(() => retentionQuery.data ?? [], [retentionQuery.data]);
  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);

  const byId = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );

  const summary = useMemo(() => summariseGates(gates), [gates]);
  const ranked = useMemo(() => rankGates(gates), [gates]);

  const mayRead = hasCapability(viewer?.capabilities ?? [], "compliance.read");
  const mayManageRetention = hasCapability(
    viewer?.capabilities ?? [],
    "retention.manage",
  );

  const failed = gatesQuery.isError || retentionQuery.isError;
  const pending =
    viewerLoading ||
    gatesQuery.isPending ||
    retentionQuery.isPending ||
    usersQuery.isPending;

  // Resolved before the capability check so a slow /me cannot flash the
  // restricted state at someone who is in fact allowed to be here.
  if (!viewerLoading && !mayRead) {
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
          title="Could not load the compliance gates"
          detail="The governance service did not respond. Nothing has changed and no gate has been cleared — a gate that was blocking a publish is still blocking it. This failure is limited to reading them."
          onRetry={() => {
            void gatesQuery.refetch();
            void retentionQuery.refetch();
          }}
        />
      </Page>
    );
  }

  return (
    <Page
      rail={
        pending ? null : (
          <Rail summary={summary} gates={gates} people={byId} />
        )
      }
    >
      <Header summary={pending ? undefined : summary} />

      {pending ? (
        <GatesSkeleton />
      ) : gates.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="No gates defined for this workspace"
          description="Gates come from the regulatory profile chosen during setup — recording law, consent, retention, and whatever the industry adds on top. An empty list means the profile has not been applied yet, not that nothing applies."
        />
      ) : (
        <>
          <section className="mt-8" aria-label="Compliance gates">
            <div className="overflow-hidden rounded-panel border border-line bg-elevated">
              {ranked.map((gate) => (
                <ComplianceGateRow
                  key={gate.id}
                  gate={gate}
                  owner={
                    gate.ownerUserId ? byId.get(gate.ownerUserId) : undefined
                  }
                  retention={policies}
                />
              ))}
            </div>
            <p className="mt-2.5 text-2xs text-faint">
              Ordered by what needs doing, then by how long it has been since
              anyone looked — not alphabetically.
            </p>
          </section>

          <Retention
            policies={policies}
            mayManage={mayManageRetention}
            loading={retentionQuery.isPending}
          />

          <Footnote />
        </>
      )}
    </Page>
  );
}

/**
 * Left-anchored, like every other reading surface in the shell. The width
 * earned above 1280px goes to the verdict and the owner breakdown — "are we
 * clear to publish" and "who do I chase" are the two questions that bring
 * someone here, and neither should cost a scroll away from the gate you are
 * reading.
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
        <div className="min-w-0 max-w-[52rem] flex-1">{children}</div>
        {rail && (
          <aside className="hidden w-[19rem] shrink-0 xl:block">{rail}</aside>
        )}
      </div>
    </div>
  );
}

function Header({ summary }: { summary?: GateSummary }) {
  const lexicon = useLexicon();

  return (
    <header>
      <p className="font-mono text-2xs tracking-wide text-faint uppercase">
        Deployment gates
      </p>
      <h1 className="mt-1.5 font-display text-3xl text-ink">Compliance</h1>

      {summary && (
        <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">
          {summary.inScope === 0 ? (
            <>Nothing in this workspace is gated yet.</>
          ) : summary.blocked ? (
            <>
              <span className="font-medium text-ink tabular">
                {summary.actionNeeded}
              </span>{" "}
              of {summary.inScope} gates that apply here{" "}
              {summary.actionNeeded === 1 ? "needs" : "need"} action. Until
              they are cleared, no new version of an{" "}
              {lower(lexicon.employee.one)} can be published — the line keeps
              answering on the version already live.
            </>
          ) : (
            <>
              All{" "}
              <span className="font-medium text-ink tabular">
                {summary.inScope}
              </span>{" "}
              gates that apply here are met. Nothing is standing between a
              finished draft and a publish.
            </>
          )}
        </p>
      )}
    </header>
  );
}

/**
 * The one place on this screen that is not about a specific gate: what happens
 * to the data the calls produce. It sits directly under the list because a
 * retention gate above it is arguing about these exact numbers, and reading the
 * argument and the figure in one scroll is the whole point.
 */
function Retention({
  policies,
  mayManage,
  loading,
}: {
  policies: RetentionPolicy[];
  mayManage: boolean;
  loading: boolean;
}) {
  if (loading) return null;

  return (
    <section className="mt-10" aria-labelledby="retention-heading">
      <h2
        id="retention-heading"
        className="font-mono text-2xs tracking-wide text-faint uppercase"
      >
        Retention
      </h2>
      <p className="mt-2 max-w-prose text-sm text-muted">
        How long each kind of data is kept, and the basis for keeping it.
        Shortening a period deletes data permanently, on the schedule it sets —
        which is why it is stated here next to the gates rather than filed in a
        settings pane.
      </p>

      {policies.length === 0 ? (
        <EmptyState
          tone="quiet"
          className="mt-2"
          title="No retention periods set"
          description="Until a period is set, nothing is scheduled for deletion and everything is kept indefinitely. That is a decision, and it is currently being made by default."
        />
      ) : (
        <div className="mt-3 overflow-hidden rounded-panel border border-line bg-elevated">
          {policies.map((policy) => (
            <div
              key={policy.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3.5 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{policy.dataType}</p>
                <p className="mt-0.5 text-xs text-faint">{policy.legalBasis}</p>
              </div>
              {/* Disabled is not a shorter period, it is a different fact, and
                  it is the one a person scanning this column must not miss. */}
              {policy.enabled ? (
                <p className="shrink-0 text-sm text-ink tabular">
                  {retentionLabel(policy.retainForDays)}
                </p>
              ) : (
                <Status tone="warning" className="shrink-0">
                  Not being kept
                </Status>
              )}
            </div>
          ))}
        </div>
      )}

      {/* No fake control. Who may change this is a real fact worth stating —
          the answer differs per viewer — and where it gets changed is stated
          plainly rather than drawn as a button that would have to lie. */}
      <p className="mt-2.5 flex items-start gap-1.5 text-2xs text-faint">
        <Lock className="mt-px size-3 shrink-0" aria-hidden />
        <span>
          {mayManage
            ? "These are yours to change. The control that edits them lands with the rest of the governance surfaces; until then a period is changed by whoever administers the workspace."
            : "Changing a period needs the retention permission, which your role does not include. The owner of each gate above can tell you where the request goes."}
        </span>
      </p>
    </section>
  );
}

function Footnote() {
  return (
    <p className="mt-10 max-w-prose border-t border-line pt-5 text-sm text-muted">
      Reading a gate changes nothing and is not logged. Clearing one happens
      wherever the underlying thing lives — a rota, a retention period, a
      published version — and every one of those changes is written to the{" "}
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
      , including who made it.
    </p>
  );
}

function Rail({
  summary,
  gates,
  people,
}: {
  summary: GateSummary;
  gates: ComplianceGate[];
  people: Map<string, User>;
}) {
  const lexicon = useLexicon();
  const oldest = oldestReview(gates);
  const owners = gatesByOwner(gates);

  if (summary.total === 0) return null;

  return (
    <div className="sticky top-8 space-y-7">
      <div>
        <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
          Publishing
        </h2>
        <p
          className={cn(
            "mt-2 font-display text-2xl",
            summary.blocked ? "text-warning" : "text-success",
          )}
        >
          {summary.blocked ? "Blocked" : "Clear"}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {summary.blocked
            ? `an unmet gate stops a new ${lower(lexicon.employee.one)} version going live`
            : `no gate is standing in the way of a new ${lower(lexicon.employee.one)} version`}
        </p>
      </div>

      <div>
        <h2 className="mb-2.5 font-mono text-2xs tracking-wide text-faint uppercase">
          Gates
        </h2>
        <dl className="overflow-hidden rounded-panel border border-line bg-elevated">
          <RailRow label="Needs action" value={summary.actionNeeded} emphasise={summary.actionNeeded > 0} />
          <RailRow label="Met" value={summary.met} />
          <RailRow label="Not applicable" value={summary.notApplicable} />
        </dl>
        <p className="mt-2 text-2xs text-faint">
          Not-applicable gates are shown and counted, never dropped — an
          obligation that was assessed and ruled out is a different answer from
          one nobody looked at.
        </p>
      </div>

      <div>
        <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
          Review currency
        </h2>
        {oldest ? (
          <>
            <p className="mt-2 text-md text-ink">{relativeLong(oldest)}</p>
            <p className="mt-0.5 text-xs text-muted">
              since the least recently reviewed gate that applies here was last
              looked at
            </p>
          </>
        ) : (
          <p className="mt-2 text-xs text-muted">
            No gate that applies here has ever been reviewed.
          </p>
        )}
      </div>

      {owners.length > 0 && (
        <div>
          <h2 className="mb-2.5 font-mono text-2xs tracking-wide text-faint uppercase">
            Answerable
          </h2>
          <dl className="overflow-hidden rounded-panel border border-line bg-elevated">
            {owners.map((owner) => (
              <div
                key={owner.ownerUserId ?? "unassigned"}
                className="flex items-baseline justify-between gap-3 border-b border-line px-3 py-2.5 last:border-b-0"
              >
                <dt className="min-w-0 flex-1 truncate text-xs text-ink">
                  {owner.ownerUserId
                    ? (people.get(owner.ownerUserId)?.name ??
                      "No longer in this workspace")
                    : "Nobody assigned"}
                </dt>
                <dd className="shrink-0 font-mono text-2xs tabular">
                  {owner.actionNeeded > 0 ? (
                    <span className="text-warning">
                      {owner.actionNeeded} of {owner.total}
                    </span>
                  ) : (
                    <span className="text-faint">{owner.total}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-2xs text-faint">
            Outstanding against total, where anything is outstanding.
          </p>
        </div>
      )}
    </div>
  );
}

function RailRow({
  label,
  value,
  emphasise = false,
}: {
  label: string;
  value: number;
  emphasise?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line px-3 py-2.5 last:border-b-0">
      <dt className="text-xs text-ink">{label}</dt>
      <dd
        className={cn(
          "font-mono text-2xs tabular",
          emphasise ? "text-warning" : "text-faint",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Not a 404 and not a shrug. The surface exists, it has contents, and the
 * viewer is not allowed to see them — saying so, and naming the permission, is
 * the same courtesy `hardBlocked` extends on a capability.
 */
function Restricted() {
  return (
    <EmptyState
      className="mt-8"
      title="You cannot see compliance gates"
      description="This surface lists the consent, recording and retention gates that block a deployment, and reading it needs the compliance permission. Your role does not include it. A workspace owner or governor can grant it, or answer the question for you."
    />
  );
}

function GatesSkeleton() {
  return (
    <div
      className="mt-8 overflow-hidden rounded-panel border border-line bg-elevated"
      aria-busy
    >
      <LoadingAnnouncement label="Loading compliance gates" />
      {[0, 1, 2].map((row) => (
        <div key={row} className="border-b border-line px-4 py-4 last:border-b-0">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="mt-2.5 h-3 w-3/4" />
          <Skeleton className="mt-3 h-9 w-full" />
        </div>
      ))}
    </div>
  );
}
