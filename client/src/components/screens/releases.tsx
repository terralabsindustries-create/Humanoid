"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  FlaskConical,
  Lock,
  RotateCcw,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import {
  useDomainPack,
  useLexicon,
  useWorkspace,
} from "@/components/providers/app-providers";
import { Button } from "@/components/primitives/button";
import { Checkbox } from "@/components/primitives/checkbox";
import { Field } from "@/components/primitives/field";
import { Textarea } from "@/components/primitives/input";
import { Status, StatusPill } from "@/components/primitives/status";
import { EmptyState, ErrorState } from "@/components/primitives/empty-state";
import {
  LoadingAnnouncement,
  Skeleton,
} from "@/components/primitives/skeleton";
import {
  ReleaseChangeList,
  ReleaseChangeSummary,
} from "@/components/domain/release-change";
import {
  RELEASE_STATE_LABEL,
  RELEASE_STATE_TONE,
  SCENARIO_RESULT_LABEL,
  SCENARIO_RESULT_TONE,
} from "@/lib/domain/labels";
import {
  canRollBack,
  gateForRun,
  gateForVersion,
  liveRelease,
  pendingReleases,
  publishBlockers,
  raisesAuthority,
  releaseHistory,
  rollbackTarget,
  type GateFinding,
  type ReleaseGate,
} from "@/lib/domain/releases";
import { hasCapability, navItemById, resolveLabel } from "@/lib/navigation";
import { resolveNavLabel } from "@/lib/domains/registry";
import { dayAndTime, relativeLong } from "@/lib/utils/time";
import type {
  AIEmployee,
  Release,
  Scenario,
  SimulationRun,
  User,
} from "@/lib/domain/types";

/**
 * Releases — change control.
 *
 * The organising idea is that a release is a *decision*, not a deployment
 * event. So the screen is split by whether the decision has been made: drafts
 * waiting on someone at the top, everything already decided below. Each half
 * shows the same thing — the literal diff — because the diff is what is being
 * decided about both before and after the fact.
 *
 * Three rules the layout exists to enforce:
 *
 * 1. Nothing publishes without a written reason. The note is the only part of
 *    a release a future reader cannot reconstruct from the data.
 * 2. Nothing publishes past an unresolved simulation finding silently. The
 *    findings are listed by name and each has to be accepted individually.
 * 3. Only the version actually in force can be rolled back, and the rollback
 *    names what it will put back in its place.
 *
 * Publishing and rolling back really do change state here, against the mock's
 * session-lived copy — see `services/mock.ts`. What they do not do is reach
 * anything: there is no employee runtime behind this yet, which the screen
 * says out loud rather than implying otherwise.
 */
export function Releases() {
  const { user, loading: workspaceLoading } = useWorkspace();
  const capabilities = user?.capabilities ?? [];

  const releasesQuery = useQuery({
    queryKey: qk.releases(),
    queryFn: () => service.listReleases(),
  });
  const employeesQuery = useQuery({
    queryKey: qk.employees,
    queryFn: () => service.listEmployees(),
  });
  const usersQuery = useQuery({
    queryKey: qk.users,
    queryFn: () => service.listUsers(),
  });
  const runsQuery = useQuery({
    queryKey: qk.simulationRuns,
    queryFn: () => service.listSimulationRuns(),
  });
  const scenariosQuery = useQuery({
    queryKey: qk.scenarios,
    queryFn: () => service.listScenarios(),
  });

  const releases = useMemo(
    () => releasesQuery.data ?? [],
    [releasesQuery.data],
  );
  const pending = useMemo(() => pendingReleases(releases), [releases]);
  const history = useMemo(() => releaseHistory(releases), [releases]);

  // Three states that look alike and must not be conflated. Still resolving:
  // say nothing yet. Resolved to a real person without the capability: refuse,
  // and say why. Resolved to nobody at all — the identity fetch failed — is a
  // *failure*, and reporting it as "you do not have permission" would send
  // someone to ask for access they already hold.
  const identityUnresolved = !workspaceLoading && !user;
  const refused = !!user && !hasCapability(capabilities, "employee.read");

  if (identityUnresolved) {
    return (
      <Page rail={null}>
        <Header />
        <ErrorState
          title="Could not confirm who you are"
          detail="Releases decide what an AI employee is allowed to say, so this screen will not render against an unknown identity. Nothing has changed about what is published."
          onRetry={() => window.location.reload()}
        />
      </Page>
    );
  }

  if (refused) {
    return (
      <Page rail={null}>
        <Header />
        <NoAccess />
      </Page>
    );
  }

  if (releasesQuery.isError) {
    return (
      <Page rail={null}>
        <Header />
        <ErrorState
          title="Could not load releases"
          detail="The release service did not respond. Whatever is published stays published — this failure is limited to this list, and nothing has changed about what is answering calls."
          onRetry={() => releasesQuery.refetch()}
        />
      </Page>
    );
  }

  const loading = releasesQuery.isPending || employeesQuery.isPending;

  return (
    <Page
      rail={
        loading ? null : (
          <LiveRail
            releases={releases}
            employees={employeesQuery.data ?? []}
            users={usersQuery.data ?? []}
            pendingCount={pending.length}
          />
        )
      }
    >
      <Header pending={pending.length} loading={loading} />

      {loading ? (
        <ReleasesSkeleton />
      ) : releases.length === 0 ? (
        <EmptyReleases />
      ) : (
        <div className="mt-9 space-y-10">
          <Band
            label="Waiting to publish"
            count={pending.length}
            empty="Nothing is waiting. Every change that has been made is live."
          >
            {pending.map((release) => (
              <PendingRelease
                key={release.id}
                release={release}
                employee={employeeFor(employeesQuery.data, release)}
                runs={runsQuery.data ?? []}
                scenarios={scenariosQuery.data ?? []}
                capabilities={capabilities}
              />
            ))}
          </Band>

          <Band
            label="Release history"
            count={history.length}
            empty="Nothing has been published yet."
          >
            {history.map((release) => (
              <HistoryRelease
                key={release.id}
                release={release}
                releases={releases}
                employee={employeeFor(employeesQuery.data, release)}
                users={usersQuery.data ?? []}
                runs={runsQuery.data ?? []}
                scenarios={scenariosQuery.data ?? []}
                capabilities={capabilities}
              />
            ))}
          </Band>
        </div>
      )}
    </Page>
  );
}

function employeeFor(
  employees: AIEmployee[] | undefined,
  release: Release,
): AIEmployee | null {
  return employees?.find((e) => e.id === release.employeeId) ?? null;
}

/** Whatever this employee is called by the persona it presents to callers. */
function employeeName(employee: AIEmployee | null): string | null {
  return (
    employee?.liveVersion?.persona.name ??
    employee?.draftVersion?.persona.name ??
    null
  );
}

function userName(users: User[], id: string | null): string | null {
  if (!id) return null;
  return users.find((user) => user.id === id)?.name ?? null;
}

/**
 * Left-anchored like every reading surface here, with the width above 1280px
 * going to what is in force right now — the fact the rest of the page is
 * implicitly about, and the one thing you should not have to scroll to check
 * while reading a diff.
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

function Header({
  pending,
  loading = false,
}: {
  pending?: number;
  loading?: boolean;
}) {
  const lexicon = useLexicon();

  return (
    <header>
      <p className="font-mono text-2xs tracking-wide text-faint uppercase">
        Change control
      </p>
      <h1 className="mt-1.5 font-display text-3xl text-ink">Releases</h1>

      {!loading && (
        <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">
          Every change to what an {lexicon.employee.one} says or does arrives
          here as a release — the diff before it goes out, and one action to
          undo it after.
          {pending !== undefined && pending > 0 && (
            <>
              {" "}
              <span className="font-medium text-ink tabular">{pending}</span>{" "}
              {pending === 1 ? "draft is" : "drafts are"} waiting on a decision.
            </>
          )}
        </p>
      )}
    </header>
  );
}

function Band({
  label,
  count,
  empty,
  children,
}: {
  label: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line pt-5">
      <div className="mb-4 flex items-baseline gap-2">
        <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
          {label}
        </h2>
        <span className="font-mono text-2xs text-faint tabular">{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <div className="space-y-5">{children}</div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Waiting to publish
// ─────────────────────────────────────────────────────────────────────────────

function PendingRelease({
  release,
  employee,
  runs,
  scenarios,
  capabilities,
}: {
  release: Release;
  employee: AIEmployee | null;
  runs: SimulationRun[];
  scenarios: Scenario[];
  capabilities: string[];
}) {
  const lexicon = useLexicon();
  const name = employeeName(employee);
  const firstPublish = employee?.liveVersion === null;

  const gate = gateForVersion(
    employee?.draftVersion?.id ?? null,
    runs,
    scenarios,
  );
  const blockers = publishBlockers(release, gate);
  const canPublish = hasCapability(capabilities, "employee.publish");

  return (
    <article className="rounded-panel border border-line-strong bg-elevated">
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={RELEASE_STATE_TONE[release.state]}>
            {RELEASE_STATE_LABEL[release.state]}
          </StatusPill>
          {firstPublish && (
            <StatusPill tone="info">First publish</StatusPill>
          )}
          {raisesAuthority(release.changes) && (
            <StatusPill
              tone="warning"
              icon={<TriangleAlert className="size-3" aria-hidden />}
            >
              Raises authority
            </StatusPill>
          )}
        </div>

        <h3 className="mt-2.5 font-display text-xl text-ink">
          {name ?? lexicon.employee.one}{" "}
          <span className="font-mono text-base text-muted tabular">
            v{release.version}
          </span>
        </h3>
        <p className="mt-1 text-sm text-muted">
          {firstPublish ? (
            <>
              Nothing has ever been published for this {lexicon.employee.one}.
              Publishing puts it on the channels it is deployed to for the first
              time.
            </>
          ) : (
            <>
              {release.changes.length}{" "}
              {release.changes.length === 1 ? "change" : "changes"} against v
              {employee?.liveVersion?.version ?? release.version - 1}, which is
              answering calls now.
            </>
          )}
        </p>
      </div>

      <div className="px-5 py-4">
        <ReleaseChangeList changes={release.changes} />
      </div>

      <div className="border-t border-line px-5 py-4">
        <Gate gate={gate} capabilities={capabilities} />
      </div>

      <div className="border-t border-line bg-subtle/50 px-5 py-4">
        {canPublish ? (
          <PublishForm release={release} gate={gate} blockers={blockers} />
        ) : (
          <ReadOnlyNotice />
        )}
      </div>
    </article>
  );
}

/**
 * The simulation verdict.
 *
 * Counts first, then every finding by name. A gate that reported only "1
 * failed" would be a score, and the whole point of arch §3.2 is that a number
 * is not something anyone can act on — "asked four clarifying questions before
 * escalating" is.
 */
function Gate({
  gate,
  capabilities,
}: {
  gate: ReleaseGate | null;
  capabilities: string[];
}) {
  if (!gate) {
    return (
      <div>
        <div className="flex items-center gap-2">
          <h4 className="font-mono text-2xs tracking-wide text-faint uppercase">
            Simulation
          </h4>
          <Status tone="warning">Not run</Status>
        </div>
        <p className="mt-2 max-w-prose text-sm text-muted">
          This version has not been rehearsed against anything. Publishing it
          would put changes in front of customers that no one has watched
          behave, which is the one thing this screen exists to prevent.
        </p>
        <SimulatorLink capabilities={capabilities} />
      </div>
    );
  }

  const clean = gate.findings.length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h4 className="font-mono text-2xs tracking-wide text-faint uppercase">
          Simulation
        </h4>
        <Status tone={clean ? "success" : gate.failures > 0 ? "danger" : "warning"}>
          {clean
            ? "Clear"
            : `${gate.findings.length} ${gate.findings.length === 1 ? "finding" : "findings"}`}
        </Status>
        <span className="font-mono text-2xs text-faint tabular">
          {gate.passed}/{gate.total} passed
          {gate.lastRunAt && <> · {relativeLong(gate.lastRunAt)}</>}
        </span>
      </div>

      {clean ? (
        <p className="mt-2 max-w-prose text-sm text-muted">
          Every scenario run against this version behaved as expected.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {gate.findings.map((finding) => (
            <li
              key={finding.id}
              className="rounded-control border border-line bg-app px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={SCENARIO_RESULT_TONE[finding.status]}>
                  {SCENARIO_RESULT_LABEL[finding.status]}
                </StatusPill>
                <span className="text-sm font-medium text-ink">
                  {finding.scenarioName}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-muted">{finding.finding}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SimulatorLink({ capabilities }: { capabilities: string[] }) {
  const lexicon = useLexicon();
  const pack = useDomainPack();
  const item = navItemById("simulator");

  if (!item) return null;

  const label = resolveNavLabel(
    item.id,
    resolveLabel(item.label, lexicon),
    pack,
  );

  if (!hasCapability(capabilities, item.capability)) {
    return (
      <p className="mt-2 text-sm text-faint">
        Running a suite against it needs someone with simulation access.
      </p>
    );
  }

  return (
    <Link
      href={item.href}
      className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-medium text-ink underline underline-offset-4 hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <FlaskConical className="size-3.5" aria-hidden />
      Run a suite in {label}
    </Link>
  );
}

/**
 * Publishing.
 *
 * The note and the acknowledgements are the control — the button is just what
 * submits them. Both are required for the same reason: a release that goes out
 * with no stated reason and no record of what was knowingly shipped past is
 * indistinguishable, six weeks later, from one that nobody thought about.
 */
function PublishForm({
  release,
  gate,
  blockers,
}: {
  release: Release;
  gate: ReleaseGate | null;
  blockers: ReturnType<typeof publishBlockers>;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [acknowledged, setAcknowledged] = useState<string[]>([]);

  const publish = useMutation({
    mutationFn: () =>
      service.publishRelease({
        releaseId: release.id,
        note,
        acknowledgedFindingIds: acknowledged,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["releases"] });
    },
  });

  const hardBlock = blockers.find(
    (blocker) => blocker.kind === "not_simulated" || blocker.kind === "no_changes",
  );
  const findings = gate?.findings ?? [];
  const outstanding = findings.filter(
    (finding) => !acknowledged.includes(finding.id),
  );
  const ready = note.trim().length > 0 && outstanding.length === 0 && !hardBlock;

  if (hardBlock) {
    return (
      <p className="text-sm text-muted">
        {hardBlock.kind === "no_changes"
          ? "There is nothing in this draft to publish."
          : "This draft cannot be published until it has been simulated."}
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !publish.isPending) publish.mutate();
      }}
    >
      {findings.length > 0 && (
        <fieldset className="mb-4">
          <legend className="text-sm font-medium text-ink">
            Accept what simulation found
          </legend>
          <p className="mt-1 mb-2.5 max-w-prose text-xs text-muted">
            Each of these is a judgement someone has to make rather than a box
            to clear. Accepting one records that you decided to publish with it
            outstanding.
          </p>
          <div className="space-y-2">
            {findings.map((finding) => (
              <Acknowledgement
                key={finding.id}
                finding={finding}
                checked={acknowledged.includes(finding.id)}
                onChange={(next) =>
                  setAcknowledged((current) =>
                    next
                      ? [...current, finding.id]
                      : current.filter((id) => id !== finding.id),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
      )}

      <Field
        label="Why this is going out"
        htmlFor={`note-${release.id}`}
        description="Read by whoever asks, weeks from now, why the answer changed. The diff is already recorded — this is the part it cannot show."
        required
      >
        <Textarea
          id={`note-${release.id}`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Adds the NHS and private dental answer callers keep asking for, and stops the calendar timing out at morning peak."
          className="min-h-20 text-sm"
        />
      </Field>

      <div className="mt-3.5 flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={!ready}
          loading={publish.isPending}
        >
          Publish v{release.version}
        </Button>
        <p className="text-xs text-muted">
          {ready
            ? "Goes live on every channel this employee is deployed to."
            : outstanding.length > 0
              ? `${outstanding.length} ${outstanding.length === 1 ? "finding" : "findings"} still to accept.`
              : "A note is needed before this can go out."}
        </p>
      </div>

      {publish.isError && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {publish.error instanceof Error
            ? publish.error.message
            : "The release could not be published."}
        </p>
      )}
    </form>
  );
}

function Acknowledgement({
  finding,
  checked,
  onChange,
}: {
  finding: GateFinding;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-control border px-3 py-2.5 transition-colors",
        checked ? "border-line-strong bg-app" : "border-line bg-app",
      )}
    >
      <Checkbox
        className="mt-0.5"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0 text-sm">
        <span className="font-medium text-ink">{finding.scenarioName}</span>
        <span className="text-muted">
          {" "}
          — {SCENARIO_RESULT_LABEL[finding.status].toLowerCase()}. Publish
          anyway.
        </span>
      </span>
    </label>
  );
}

function ReadOnlyNotice() {
  const lexicon = useLexicon();
  return (
    <p className="text-sm text-muted">
      Your role can read what is about to change but not publish it. Changing
      what an {lexicon.employee.one} does on a live channel is a builder&rsquo;s
      action.
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Published
// ─────────────────────────────────────────────────────────────────────────────

function HistoryRelease({
  release,
  releases,
  employee,
  users,
  runs,
  scenarios,
  capabilities,
}: {
  release: Release;
  releases: Release[];
  employee: AIEmployee | null;
  users: User[];
  runs: SimulationRun[];
  scenarios: Scenario[];
  capabilities: string[];
}) {
  const [open, setOpen] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);

  const name = employeeName(employee);
  const publisher = userName(users, release.publishedByUserId);
  const live = canRollBack(releases, release);
  const gate = gateForRun(release.simulationRunId, runs, scenarios);
  const canPublish = hasCapability(capabilities, "employee.publish");

  return (
    <article
      className={cn(
        "rounded-panel border bg-elevated",
        live ? "border-line-strong" : "border-line",
      )}
    >
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* "In force" is the fact people scan for, so it leads and carries
              its own word rather than being inferred from position. */}
          {live ? (
            <StatusPill tone="success">In force now</StatusPill>
          ) : (
            <StatusPill tone={RELEASE_STATE_TONE[release.state]}>
              {RELEASE_STATE_LABEL[release.state]}
            </StatusPill>
          )}
          {raisesAuthority(release.changes) && (
            <StatusPill
              tone="warning"
              icon={<TriangleAlert className="size-3" aria-hidden />}
            >
              Raised authority
            </StatusPill>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="font-display text-lg text-ink">
            {name ?? "Unknown"}{" "}
            <span className="font-mono text-sm text-muted tabular">
              v{release.version}
            </span>
          </h3>
          {release.publishedAt && (
            <p className="font-mono text-2xs text-faint tabular">
              {dayAndTime(release.publishedAt)}
              {publisher && <> · {publisher}</>}
            </p>
          )}
        </div>

        {release.note && (
          <p className="mt-2 max-w-prose text-sm text-ink">{release.note}</p>
        )}

        {release.state === "rolled_back" && (
          <div className="mt-3 rounded-control bg-warning-surface px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
              <Undo2 className="size-3.5" aria-hidden />
              Rolled back
              {release.rolledBackAt && (
                <span className="font-normal">
                  {" "}
                  {relativeLong(release.rolledBackAt)}
                </span>
              )}
            </p>
            <p className="mt-1 text-sm text-warning">
              {release.rolledBackReason ??
                "No reason was recorded, which is itself worth chasing."}
            </p>
          </div>
        )}

        <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={`changes-${release.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform", open && "rotate-180")}
              aria-hidden
            />
            {open ? "Hide" : "Show"} {release.changes.length}{" "}
            {release.changes.length === 1 ? "change" : "changes"}
          </button>

          {gate && (
            <span className="font-mono text-2xs text-faint tabular">
              Simulation {gate.passed}/{gate.total} passed
            </span>
          )}

          {live && canPublish && !rollingBack && (
            <Button
              size="sm"
              variant="quiet"
              icon={<RotateCcw className="size-3.5" aria-hidden />}
              onClick={() => setRollingBack(true)}
            >
              Roll back
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div
          id={`changes-${release.id}`}
          className="border-t border-line px-5 py-4"
        >
          <ReleaseChangeSummary changes={release.changes} />
        </div>
      )}

      {rollingBack && (
        <div className="border-t border-line bg-subtle/50 px-5 py-4">
          <RollbackForm
            release={release}
            target={rollbackTarget(releases, release)}
            onCancel={() => setRollingBack(false)}
          />
        </div>
      )}
    </article>
  );
}

/**
 * Rolling back.
 *
 * One action to start, one field to justify it, and the version it will put
 * back named in the button — because "roll back" on its own does not say what
 * customers will hear next, and that is the entire question.
 */
function RollbackForm({
  release,
  target,
  onCancel,
}: {
  release: Release;
  target: Release | null;
  onCancel: () => void;
}) {
  const lexicon = useLexicon();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const rollback = useMutation({
    mutationFn: () =>
      service.rollbackRelease({ releaseId: release.id, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["releases"] });
    },
  });

  if (!target) {
    return (
      <div>
        <p className="max-w-prose text-sm text-ink">
          There is nothing to roll back to. This is the first published version,
          so undoing it would leave the {lexicon.employee.one} with no
          configuration at all rather than an earlier one.
        </p>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Taking it off the line is a different action — pausing the{" "}
          {lexicon.employee.one} rather than reverting it.
        </p>
        <Button size="sm" variant="quiet" className="mt-3" onClick={onCancel}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (reason.trim() && !rollback.isPending) rollback.mutate();
      }}
    >
      <Field
        label={`Why v${release.version} is being pulled`}
        htmlFor={`reason-${release.id}`}
        description={`Callers will hear v${target.version} from the next call onwards.`}
        required
      >
        <Textarea
          id={`reason-${release.id}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="What went wrong, and what it did to callers."
          className="min-h-16 text-sm"
        />
      </Field>

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="danger"
          size="sm"
          disabled={reason.trim().length === 0}
          loading={rollback.isPending}
        >
          Roll back to v{target.version}
        </Button>
        <Button size="sm" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {rollback.isError && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {rollback.error instanceof Error
            ? rollback.error.message
            : "The rollback did not go through."}
        </p>
      )}
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rail, empty and refused states
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What is answering calls right now.
 *
 * The rest of the page is about changes; this is the thing being changed. It
 * is per employee rather than a single figure because "the live version" is
 * not one fact in a workspace with a roster.
 */
function LiveRail({
  releases,
  employees,
  users,
  pendingCount,
}: {
  releases: Release[];
  employees: AIEmployee[];
  users: User[];
  pendingCount: number;
}) {
  const lexicon = useLexicon();

  const rolledBack = releases
    .filter((release) => release.state === "rolled_back")
    .sort((a, b) => (b.rolledBackAt ?? "").localeCompare(a.rolledBackAt ?? ""))[0];

  if (employees.length === 0) return null;

  return (
    <div className="sticky top-8 space-y-7">
      <div>
        <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
          In force now
        </h2>
        <dl className="mt-2.5 space-y-3.5">
          {employees.map((employee) => {
            const live = liveRelease(releases, employee.id);
            const name = employeeName(employee);
            const publisher = userName(users, live?.publishedByUserId ?? null);

            return (
              <div key={employee.id}>
                <dt className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-ink">
                    {name ?? lexicon.employee.one}
                  </span>
                  <span className="font-mono text-2xs text-muted tabular">
                    {live ? `v${live.version}` : "—"}
                  </span>
                </dt>
                <dd className="mt-0.5 text-xs text-muted">
                  {live?.publishedAt ? (
                    <>
                      Published {relativeLong(live.publishedAt)}
                      {publisher && <> by {publisher}</>}
                    </>
                  ) : (
                    "Never published — draft only"
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      {pendingCount > 0 && (
        <div>
          <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
            Waiting
          </h2>
          <p className="mt-2 font-display text-2xl text-ink tabular">
            {pendingCount}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {pendingCount === 1 ? "draft" : "drafts"} nobody has published
          </p>
        </div>
      )}

      {rolledBack && (
        <div>
          <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
            Last rollback
          </h2>
          <p className="mt-2 font-mono text-sm text-ink tabular">
            v{rolledBack.version}
            {rolledBack.rolledBackAt && (
              <span className="ml-1.5 font-sans text-xs text-faint">
                {relativeLong(rolledBack.rolledBackAt)}
              </span>
            )}
          </p>
          {rolledBack.rolledBackReason && (
            <p className="mt-1 text-xs text-muted">
              {rolledBack.rolledBackReason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyReleases() {
  const lexicon = useLexicon();
  return (
    <div className="mt-6">
      <EmptyState
        title="Nothing has been released yet"
        description={`Every change to your ${lexicon.employee.many} lands here first — what changed, who changed it, why, and what simulation found before it went out. The first release appears once there is a draft to publish.`}
      />
    </div>
  );
}

/**
 * A refusal, not a blank page.
 *
 * Someone reaching this URL without the capability got here from a link or a
 * bookmark, not the navigation — Build does not appear for them at all. Saying
 * what the surface is and who holds the key is more useful than a redirect
 * that leaves them wondering whether the page exists.
 */
function NoAccess() {
  const lexicon = useLexicon();
  return (
    <div className="mt-8 max-w-prose rounded-panel border border-line bg-elevated px-5 py-5">
      <p className="flex items-center gap-2 text-md font-medium text-ink">
        <Lock className="size-4 text-faint" aria-hidden />
        This surface belongs to builders
      </p>
      <p className="mt-2 text-sm text-muted">
        Releases show and change what an {lexicon.employee.one} is configured to
        do. Your role can see the results of those changes across the rest of
        the workspace, but not make or undo them.
      </p>
      <Link
        href="/today"
        className="mt-4 inline-block text-sm font-medium text-ink underline underline-offset-4 hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        Back to Today
      </Link>
    </div>
  );
}

function ReleasesSkeleton() {
  return (
    <div className="mt-9 space-y-5" aria-busy>
      <LoadingAnnouncement label="Loading releases" />
      {[0, 1].map((card) => (
        <div key={card} className="rounded-panel border border-line bg-elevated">
          <div className="border-b border-line px-5 py-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-5 w-40" />
            <Skeleton className="mt-2 h-3 w-64" />
          </div>
          <div className="space-y-2 px-5 py-4">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
