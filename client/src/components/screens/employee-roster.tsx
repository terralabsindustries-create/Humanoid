"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Lock, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import {
  useDomainPack,
  useLexicon,
  useWorkspace,
} from "@/components/providers/app-providers";
import { resolveNavLabel } from "@/lib/domains/registry";
import { Status, StatusPill } from "@/components/primitives/status";
import { EmptyState, ErrorState } from "@/components/primitives/empty-state";
import { LoadingAnnouncement, Skeleton } from "@/components/primitives/skeleton";
import {
  CHANNEL_LABEL,
  EMPLOYEE_STATUS_LABEL,
  EMPLOYEE_STATUS_TONE,
} from "@/lib/domain/labels";
import {
  activeVersion,
  aiCapability,
  authorityBands,
  capabilityLabel,
  draftDiffers,
  employeeName,
  employeeRole,
  resolveCopy,
  sortRoster,
  summariseAuthority,
  type AuthorityRow,
} from "@/lib/domain/employees";
import { hasCapability, navItemById, resolveLabel } from "@/lib/navigation";
import { count, lower, type Lexicon } from "@/lib/lexicon";
import { relativeAgo } from "@/lib/utils/time";
import type { AIEmployee } from "@/lib/domain/types";

/**
 * The AI employee roster.
 *
 * Build's front door, and the one screen an owner is told to read before going
 * live — so it is organised around the question that visit is asking: *what is
 * answering my phones, and what can it do without me?* Both halves are on the
 * card. Status and channels answer the first; the authority summary answers the
 * second in consequences rather than counts, and the full matrix is one click
 * away rather than folded into a list nobody scrolls.
 *
 * The rail carries the fact that makes the rest of it credible: the capabilities
 * that cannot be switched on at all, for any employee here. §3.11 is explicit
 * that hard blocks are rendered with their reason rather than hidden, and "can
 * it take card details?" deserves a visible no on the way in, not a greyed-out
 * control found later.
 *
 * Nothing on this screen writes. What an employee may do is changed against a
 * draft and published through Releases — which exists and says so — and this
 * surface deliberately stops at the review.
 */
export function EmployeeRoster() {
  const lexicon = useLexicon();
  const pack = useDomainPack();
  const { user, loading: workspaceLoading } = useWorkspace();
  const capabilities = user?.capabilities ?? [];

  const employeesQuery = useQuery({
    queryKey: qk.employees,
    queryFn: () => service.listEmployees(),
  });

  const employees = useMemo(
    () => sortRoster(employeesQuery.data ?? []),
    [employeesQuery.data],
  );

  const title = resolveNavLabel("employees", lexicon.employee.many, pack);

  // The capability check waits for the real user: a hard reload would otherwise
  // paint a refusal at every visitor for a moment before `/me` lands.
  if (!workspaceLoading && !hasCapability(capabilities, "employee.read")) {
    return (
      <Page rail={null}>
        <Header title={title} />
        <NoAccess />
      </Page>
    );
  }

  if (employeesQuery.isError) {
    return (
      <Page rail={null}>
        <Header title={title} />
        <ErrorState
          title={`Could not load your ${lower(title)}`}
          detail="The roster did not respond. Whatever is live stays live and is still answering calls — this failure is limited to this list."
          onRetry={() => employeesQuery.refetch()}
        />
      </Page>
    );
  }

  if (employeesQuery.isPending) {
    return (
      <Page rail={null}>
        <Header title={title} />
        <RosterSkeleton label={`Loading your ${lower(title)}`} />
      </Page>
    );
  }

  if (employees.length === 0) {
    return (
      <Page rail={null}>
        <Header title={title} />
        <EmptyState
          className="mt-8"
          title={`No ${lower(lexicon.employee.many)} yet`}
          description={`An ${lower(lexicon.employee.one)} is created when you finish setting up your workspace, and appears here with everything it has been told about the business.`}
        />
      </Page>
    );
  }

  return (
    <Page rail={<Rail employees={employees} />}>
      <Header title={title} employees={employees} />

      <div className="mt-8 space-y-4">
        {employees.map((employee) => (
          <EmployeeCard key={employee.id} employee={employee} />
        ))}
      </div>

      <ChangeNote capabilities={capabilities} />
    </Page>
  );
}

/**
 * Left-anchored, per rule 7. The width earned above 1280px goes to the hard
 * blocks, which are a different cut of the same data rather than decoration:
 * the roster answers "what can each of them do" and the rail answers "what can
 * none of them do", and the second is the question a nervous owner asks first.
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
          <aside className="hidden w-[19rem] shrink-0 xl:block">
            <div className="sticky top-8">{rail}</div>
          </aside>
        )}
      </div>
    </div>
  );
}

function Header({
  title,
  employees,
}: {
  title: string;
  employees?: AIEmployee[];
}) {
  const lexicon = useLexicon();

  return (
    <header>
      <p className="font-mono text-2xs tracking-wide text-faint uppercase">
        Build
      </p>
      <h1 className="mt-1.5 font-display text-3xl text-ink">{title}</h1>

      {employees && (
        <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">
          {summarise(employees, lexicon)}
        </p>
      )}
    </header>
  );
}

/**
 * The roster in a sentence, written from what is actually answering rather than
 * as a count of rows. "Two AI employees" tells an owner nothing they cannot see;
 * "one is live, one has never been published" tells them where to look.
 */
function summarise(employees: AIEmployee[], lexicon: Lexicon): string {
  const live = employees.filter((employee) => employee.status === "live");
  const unpublished = employees.filter(
    (employee) => employee.liveVersion === null,
  );
  // Only employees that are already live can have "a change waiting": for one
  // that has never been published the draft is not a change, it is the whole
  // thing — and it has already been counted in the clause above.
  const withDraft = employees.filter(
    (employee) => employee.liveVersion !== null && draftDiffers(employee),
  );

  const parts: string[] = [];

  if (live.length === 0) {
    parts.push(
      `Nothing here is answering calls yet — no ${lower(lexicon.employee.one)} has been published.`,
    );
  } else {
    const names = live
      .map((employee) => employeeName(employee))
      .filter((name): name is string => name !== null);
    parts.push(
      names.length > 0 && names.length === live.length
        ? `${joinNames(names)} ${live.length === 1 ? "is" : "are"} live and taking calls.`
        : `${count(live.length, lexicon.employee)} live and taking calls.`,
    );
  }

  if (unpublished.length > 0) {
    parts.push(`${subject(unpublished.length)} never been published.`);
  }
  if (withDraft.length > 0) {
    parts.push(`${subject(withDraft.length)} a change waiting in draft.`);
  }

  return parts.join(" ");
}

/**
 * "One has" / "Two have". Spelled out because this is prose: a sentence reading
 * "One has never been published. 2 have a change waiting" mixes two registers in
 * consecutive clauses. Past nine it stops being a word anyone reads faster than
 * a numeral, and a roster that long is a different design problem.
 */
const NUMBER_WORD = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
];

function subject(n: number): string {
  const word = NUMBER_WORD[n] ?? String(n);
  return n === 1 ? `${word} has` : `${word} have`;
}

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// A card
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One employee.
 *
 * The whole card is the link, because there is exactly one thing to do with an
 * employee on this screen — open it — and a card with a "View" button in the
 * corner makes the other 95% of the surface look inert.
 */
function EmployeeCard({ employee }: { employee: AIEmployee }) {
  const lexicon = useLexicon();
  const version = activeVersion(employee);
  const name = employeeName(employee);
  const role = employeeRole(employee);
  const authority = summariseAuthority(version);
  const hasDraft = draftDiffers(employee);

  return (
    <Link
      href={`/build/employees/${employee.id}`}
      className={cn(
        "group block overflow-hidden rounded-panel border border-line bg-elevated",
        "transition-colors hover:border-line-strong",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
      )}
    >
      <div className="px-5 pt-4 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl text-ink">
                {name ?? "Unnamed"}
              </h2>
              <StatusPill tone={EMPLOYEE_STATUS_TONE[employee.status]}>
                {EMPLOYEE_STATUS_LABEL[employee.status]}
              </StatusPill>
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {role ?? `No role set for this ${lower(lexicon.employee.one)}`}
            </p>
          </div>

          <ChevronRight
            className="mt-1 size-4 shrink-0 text-faint transition-colors group-hover:text-muted"
            aria-hidden
          />
        </div>

        {version?.persona.greeting && (
          <p className="mt-3.5 max-w-prose border-l-2 border-line pl-3 text-sm text-muted italic">
            “{version.persona.greeting}”
          </p>
        )}
      </div>

      <dl className="grid gap-x-6 gap-y-3 border-t border-line bg-subtle px-5 py-3.5 sm:grid-cols-2">
        <CardFact label="What it may do alone">
          {authority ? (
            <span className="text-ink">{authority}</span>
          ) : (
            <span className="text-warning">
              Nothing granted — it could not act if it were live
            </span>
          )}
        </CardFact>

        <CardFact label="Where it answers">
          <Channels employee={employee} />
        </CardFact>
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-line px-5 py-2.5">
        <p className="font-mono text-2xs text-faint tabular">
          {employee.liveVersion ? (
            <>
              v{employee.liveVersion.version} live
              {employee.liveVersion.publishedAt && (
                <> · published {relativeAgo(employee.liveVersion.publishedAt)}</>
              )}
            </>
          ) : (
            <>Never published</>
          )}
        </p>

        {/* Only where something is already live. On a never-published employee
            the status pill and "Never published" have said this twice already,
            and a third phrasing of the same fact reads as three facts. */}
        {hasDraft && employee.liveVersion && employee.draftVersion && (
          <Status tone="info">
            v{employee.draftVersion.version} draft waiting
          </Status>
        )}
      </div>
    </Link>
  );
}

function CardFact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-2xs tracking-wide text-faint uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

/**
 * Channels, as the endpoints a person can dial rather than as channel names.
 * "Phone +44 161 496 0114" can be checked against the number on the wall;
 * "voice, sms" cannot.
 */
function Channels({ employee }: { employee: AIEmployee }) {
  const lexicon = useLexicon();

  if (employee.deployments.length === 0) {
    return (
      <span className="text-faint">
        No channel recorded — no caller reaches this{" "}
        {lower(lexicon.employee.one)}
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {employee.deployments.map((deployment) => (
        <span key={deployment.id} className="text-ink">
          <span className="text-muted">{CHANNEL_LABEL[deployment.channel]} </span>
          <span className="font-mono text-xs tabular">{deployment.endpoint}</span>
        </span>
      ))}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The rail
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What none of them can do.
 *
 * Derived from every version on the roster rather than from one, because the
 * claim being made is about the workspace: a block that held for the live
 * employee and not for the draft would not be a block. So a capability only
 * appears here when it is blocked everywhere it appears.
 */
function Rail({ employees }: { employees: AIEmployee[] }) {
  const lexicon = useLexicon();

  const blocked = useMemo(() => universallyBlocked(employees), [employees]);

  if (blocked.length === 0) return null;

  return (
    <div className="space-y-2.5">
      <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
        What none of them can do
      </h2>

      <div className="overflow-hidden rounded-panel border border-line bg-elevated">
        {blocked.map((row) => (
          <div key={row.capabilityId} className="border-b border-line px-3.5 py-3 last:border-b-0">
            <p className="flex items-start gap-2 text-xs font-medium text-ink">
              <ShieldOff className="mt-px size-3.5 shrink-0 text-faint" aria-hidden />
              {capabilityLabel(row.capabilityId, lexicon)}
            </p>
            {/* The catalogue's reason rather than any grant's. A grant's reason
                is authored about one employee — "Maya offers a payment link" —
                and this list is making a claim about all of them. */}
            {(() => {
              const reason = aiCapability(row.capabilityId)?.restrictionReason;
              return reason ? (
                <p className="mt-1.5 pl-[1.375rem] text-2xs leading-relaxed text-muted">
                  {resolveCopy(reason, lexicon)}
                </p>
              ) : null;
            })()}
          </div>
        ))}
      </div>

      <p className="text-2xs leading-relaxed text-faint">
        These are not preferences and no {lower(lexicon.employee.one)} here can be
        given them. The reason is stated rather than left as a control that does
        nothing.
      </p>
    </div>
  );
}

function universallyBlocked(employees: AIEmployee[]): AuthorityRow[] {
  const versions = employees.flatMap((employee) =>
    [employee.liveVersion, employee.draftVersion].filter(
      (version): version is NonNullable<typeof version> => version !== null,
    ),
  );
  if (versions.length === 0) return [];

  const perVersion = versions.map(
    (version) =>
      new Map(
        (authorityBands(version).find((band) => band.id === "blocked")?.rows ?? []).map(
          (row) => [row.capabilityId, row],
        ),
      ),
  );

  const [first, ...rest] = perVersion;
  return [...first.values()].filter((row) =>
    rest.every((map) => map.has(row.capabilityId)),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Footnotes
// ─────────────────────────────────────────────────────────────────────────────

/** Where a change to any of this is actually made, and by whom. */
function ChangeNote({ capabilities }: { capabilities: string[] }) {
  const lexicon = useLexicon();
  const pack = useDomainPack();
  const releases = navItemById("releases");
  const canPublish = hasCapability(capabilities, "employee.publish");

  return (
    <p className="mt-6 max-w-prose text-sm leading-relaxed text-muted">
      Nothing on this screen changes what an {lower(lexicon.employee.one)} does.
      Changes accumulate in a draft, are rehearsed against the simulator, and go
      live through{" "}
      {releases ? (
        <Link
          href={releases.href}
          className="text-ink underline underline-offset-4 hover:text-muted"
        >
          {resolveNavLabel(
            releases.id,
            resolveLabel(releases.label, lexicon),
            pack,
          )}
        </Link>
      ) : (
        "a release"
      )}
      , with a diff and a one-action rollback.
      {!canPublish && " Publishing one is not something your role can do."}
    </p>
  );
}

function NoAccess() {
  const lexicon = useLexicon();

  return (
    <div className="mt-8 max-w-prose rounded-panel border border-line bg-elevated px-5 py-5">
      <p className="flex items-center gap-2 text-md font-medium text-ink">
        <Lock className="size-4 text-faint" aria-hidden />
        This surface belongs to builders
      </p>
      <p className="mt-2 text-sm text-muted">
        The roster is where what an {lower(lexicon.employee.one)} is allowed to do
        is set. Your role works with the results — the{" "}
        {lower(lexicon.conversation.many)} it handles, the queue of things it
        could not — without being able to change the authority behind them.
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

function RosterSkeleton({ label }: { label: string }) {
  return (
    <div className="mt-8 space-y-4" aria-busy>
      <LoadingAnnouncement label={label} />
      {[0, 1].map((card) => (
        <div key={card} className="rounded-panel border border-line bg-elevated">
          <div className="px-5 pt-4 pb-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-2 h-3.5 w-48" />
            <Skeleton className="mt-4 h-3.5 w-3/4" />
          </div>
          <div className="grid gap-4 border-t border-line bg-subtle px-5 py-3.5 sm:grid-cols-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3.5 w-36" />
          </div>
        </div>
      ))}
    </div>
  );
}
