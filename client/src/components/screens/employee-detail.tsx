"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  ClipboardList,
  FlaskConical,
  Languages,
  Lock,
  PhoneOff,
  Plug,
  ScrollText,
  ShieldOff,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import {
  useDomainPack,
  useLexicon,
  useWorkspace,
} from "@/components/providers/app-providers";
import { resolveNavLabel, type DomainPack } from "@/lib/domains/registry";
import { Badge, Status, StatusPill } from "@/components/primitives/status";
import { ErrorState } from "@/components/primitives/empty-state";
import {
  LoadingAnnouncement,
  Skeleton,
  SkeletonText,
} from "@/components/primitives/skeleton";
import { AutonomyBadge } from "@/components/domain/autonomy-ladder";
import { FallbackSummary } from "@/components/domain/fallback-path";
import { ReleaseChangeSummary } from "@/components/domain/release-change";
import {
  CHANNEL_LABEL,
  EMPLOYEE_STATUS_LABEL,
  EMPLOYEE_STATUS_TONE,
  humanize,
} from "@/lib/domain/labels";
import {
  authorityBands,
  capabilityDetail,
  capabilityLabel,
  describeLimits,
  draftDiffers,
  employeeName,
  grantedAssets,
  resolveCopy,
  type AuthorityBand,
  type AuthorityRow,
} from "@/lib/domain/employees";
import { summariseHours } from "@/lib/domain/channels";
import { gateForVersion } from "@/lib/domain/releases";
import {
  hasCapability,
  navItemById,
  resolveLabel,
  type NavItem,
} from "@/lib/navigation";
import { count, lower } from "@/lib/lexicon";
import { dayAndTime, relativeAgo } from "@/lib/utils/time";
import type {
  AIEmployee,
  Deployment,
  EmployeeVersion,
  User,
} from "@/lib/domain/types";

/**
 * One AI employee, and the Authority Matrix.
 *
 * §3.11 calls the matrix "the single screen an owner reviews before going live",
 * so the whole page is arranged as that review rather than as a settings form.
 * Three decisions follow from it.
 *
 * **The matrix is banded by consequence, not listed by capability.** The
 * question being asked is *what happens without me?* — so the headings are the
 * answers to it, worst-case first, and a capability's position in the list is
 * the answer rather than something to be decoded from a column of enum values.
 *
 * **Every capability appears, including the ones nobody granted.** A review that
 * listed only what was switched on could not answer "can it take card details?",
 * and that unanswered question is exactly what §3.11 says hard blocks exist to
 * settle: they are rendered with the reason, never hidden.
 *
 * **Draft and live are the same page, switched.** An employee with a change
 * waiting has two authority matrices, and reading one while believing it is the
 * other is the failure §3.10 exists to prevent. The switch names which is on the
 * phone right now, and nothing else on the page moves.
 */
export function EmployeeDetail({ id }: { id: string }) {
  const { user, loading: workspaceLoading } = useWorkspace();
  const capabilities = user?.capabilities ?? [];

  const employeeQuery = useQuery({
    queryKey: qk.employee(id),
    queryFn: () => service.getEmployee(id),
  });

  if (!workspaceLoading && !hasCapability(capabilities, "employee.read")) {
    return (
      <Page>
        <BackLink />
        <NoAccess />
      </Page>
    );
  }

  if (employeeQuery.isError) {
    return (
      <Page>
        <BackLink />
        <ErrorState
          title="Could not load this record"
          detail="The roster did not respond. Whatever is live stays live and is still answering calls — this failure is limited to this page."
          onRetry={() => employeeQuery.refetch()}
        />
      </Page>
    );
  }

  if (employeeQuery.isPending) {
    return (
      <Page>
        <BackLink />
        <div className="mt-6" aria-busy>
          <LoadingAnnouncement label="Loading this record" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-3 h-8 w-56" />
          <SkeletonText className="mt-6" lines={3} />
        </div>
      </Page>
    );
  }

  if (!employeeQuery.data) return <NotFound />;

  return <EmployeeBody employee={employeeQuery.data} />;
}

function EmployeeBody({ employee }: { employee: AIEmployee }) {
  const lexicon = useLexicon();

  // Live is the default because it is what callers are hearing. A page that
  // opened on the draft would answer "what does it do" with something that has
  // not happened yet.
  const [showing, setShowing] = useState<"live" | "draft">(
    employee.liveVersion ? "live" : "draft",
  );

  const version =
    showing === "live"
      ? (employee.liveVersion ?? employee.draftVersion)
      : (employee.draftVersion ?? employee.liveVersion);

  const bothExist = Boolean(employee.liveVersion && employee.draftVersion);
  const name = employeeName(employee) ?? "Unnamed";

  return (
    <Page rail={<Facts employee={employee} version={version} />}>
      <BackLink />

      <header className="mt-5">
        <p className="font-mono text-2xs tracking-wide text-faint uppercase">
          {version?.persona.role ?? lexicon.employee.one}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl text-ink">{name}</h1>
          <StatusPill tone={EMPLOYEE_STATUS_TONE[employee.status]}>
            {EMPLOYEE_STATUS_LABEL[employee.status]}
          </StatusPill>
        </div>

        {version?.persona.greeting ? (
          <p className="mt-4 max-w-prose border-l-2 border-line pl-4 text-lg leading-relaxed text-muted italic">
            “{version.persona.greeting}”
          </p>
        ) : (
          <p className="mt-4 max-w-prose text-md leading-relaxed text-muted">
            No greeting is written on this version. The channel composes one from
            the business name and {name} when it answers, so what a caller hears
            first is not something anyone here has approved word for word.
          </p>
        )}
      </header>

      {bothExist && (
        <VersionSwitch
          employee={employee}
          showing={showing}
          onShow={setShowing}
        />
      )}

      <div className="mt-9 space-y-9">
        <Authority version={version} />
        <Escalation version={version} />
        <Manner version={version} />
        <WhereItAnswers employee={employee} />
        <Granted version={version} />
        <DraftWaiting employee={employee} />
      </div>
    </Page>
  );
}

function Page({
  children,
  rail,
}: {
  children: React.ReactNode;
  rail?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-8 sm:px-8 sm:py-12 xl:px-10">
      <div className="flex gap-10 2xl:gap-14">
        <div className="min-w-0 max-w-[48rem] flex-1">{children}</div>
        {rail && (
          <aside className="hidden w-[19rem] shrink-0 xl:block">
            <div className="sticky top-8">{rail}</div>
          </aside>
        )}
      </div>
    </div>
  );
}

function BackLink() {
  const lexicon = useLexicon();
  const pack = useDomainPack();

  return (
    <Link
      href="/build/employees"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      {resolveNavLabel("employees", lexicon.employee.many, pack)}
    </Link>
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
      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
          {label}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Draft / live
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which version the page is describing.
 *
 * Labelled with what each one *is* rather than "Live / Draft" alone: an owner
 * needs to know that one of these is on the phone and the other is not, and
 * a two-word toggle is where that gets lost.
 */
function VersionSwitch({
  employee,
  showing,
  onShow,
}: {
  employee: AIEmployee;
  showing: "live" | "draft";
  onShow: (next: "live" | "draft") => void;
}) {
  const differs = draftDiffers(employee);

  return (
    <div className="mt-6">
      <div
        role="group"
        aria-label="Which version to show"
        className="inline-flex rounded-control bg-subtle p-0.5"
      >
        <SwitchButton
          active={showing === "live"}
          onClick={() => onShow("live")}
          label={`v${employee.liveVersion!.version} · on the phone now`}
        />
        <SwitchButton
          active={showing === "draft"}
          onClick={() => onShow("draft")}
          label={`v${employee.draftVersion!.version} · draft, not published`}
        />
      </div>

      {!differs && (
        <p className="mt-2 text-xs text-faint">
          The draft is identical to what is live. Nothing has been changed in it
          yet.
        </p>
      )}
    </div>
  );
}

function SwitchButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-[7px] px-3 py-1.5 text-xs font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
        active
          ? "bg-elevated text-ink shadow-sm"
          : "text-muted hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The authority matrix
// ─────────────────────────────────────────────────────────────────────────────

function Authority({ version }: { version: EmployeeVersion | null }) {
  const lexicon = useLexicon();
  const bands = useMemo(() => authorityBands(version), [version]);

  const usersQuery = useQuery({
    queryKey: qk.users,
    queryFn: () => service.listUsers(),
  });

  const granted = version?.authority.length ?? 0;

  return (
    <Band label="Authority">
      {granted === 0 ? (
        <div className="rounded-panel border border-warning-surface bg-warning-surface px-4 py-3.5">
          <p className="flex items-center gap-2 text-sm font-medium text-warning">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            Nothing has been granted
          </p>
          <p className="mt-1.5 max-w-prose text-sm text-muted">
            This {lower(lexicon.employee.one)} has been named and given something
            to read from, and nothing else. Put on a line as it stands it could
            answer a question and then have to hand the caller to a person for
            anything that changes something.
          </p>
        </div>
      ) : (
        <p className="max-w-prose text-sm leading-relaxed text-muted">
          Read top to bottom, this is what happens on a call when nobody is
          watching. Every capability is listed, including the ones nothing has
          been granted for — a review that showed only what is switched on could
          not answer the question that brought you here.
        </p>
      )}

      <div className="mt-5 space-y-5">
        {bands.map((band) => (
          <BandBlock
            key={band.id}
            band={band}
            users={usersQuery.data ?? []}
            usersLoading={usersQuery.isPending}
          />
        ))}
      </div>
    </Band>
  );
}

function BandBlock({
  band,
  users,
  usersLoading,
}: {
  band: AuthorityBand;
  users: User[];
  usersLoading: boolean;
}) {
  const lexicon = useLexicon();

  return (
    <section>
      <div className="flex items-baseline gap-2">
        <h3 className="text-md font-medium text-ink">{band.headline}</h3>
        <span className="font-mono text-2xs text-faint tabular">
          {band.rows.length}
        </span>
      </div>
      <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted">
        {resolveCopy(band.detail, lexicon)}
      </p>

      <div className="mt-2.5 overflow-hidden rounded-panel border border-line bg-elevated">
        {band.rows.map((row) => (
          <CapabilityRow
            key={row.capabilityId}
            row={row}
            band={band}
            users={users}
            usersLoading={usersLoading}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * One capability.
 *
 * The limits and the approvers sit on the row rather than behind a disclosure,
 * because "does it, up to twice a call, only once the caller is identified" is
 * one fact and reading half of it is worse than reading none. A capability with
 * no limits says so outright: a blank space there reads as something that failed
 * to load, and "no cap on how often it does this" is precisely the finding this
 * screen exists to produce.
 */
function CapabilityRow({
  row,
  band,
  users,
  usersLoading,
}: {
  row: AuthorityRow;
  band: AuthorityBand;
  users: User[];
  usersLoading: boolean;
}) {
  const lexicon = useLexicon();
  const { workspace } = useWorkspace();

  const label = capabilityLabel(row.capabilityId, lexicon);
  const detail = capabilityDetail(row.capabilityId, lexicon);
  const grant = row.grant;
  const blocked = band.id === "blocked";
  const limits = grant ? describeLimits(grant.limits, workspace?.currency) : [];

  const approvers = grant?.approverUserIds
    .map((id) => users.find((user) => user.id === id)?.name ?? null)
    .filter((name): name is string => name !== null);

  return (
    <div className="border-b border-line px-4 py-3.5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-1.5">
        <div className="min-w-0 flex-1">
          <p className="flex items-start gap-2 text-sm font-medium text-ink">
            {blocked && (
              <ShieldOff
                className="mt-0.5 size-3.5 shrink-0 text-faint"
                aria-hidden
              />
            )}
            {label}
          </p>
          {detail && (
            <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted">
              {detail}
            </p>
          )}
        </div>

        <div className="shrink-0">
          {blocked ? (
            <Status tone="danger" icon={<Lock className="size-3" aria-hidden />}>
              Blocked
            </Status>
          ) : grant ? (
            <AutonomyBadge level={grant.autonomy} />
          ) : (
            <span className="text-xs text-faint">Not granted</span>
          )}
        </div>
      </div>

      {blocked && row.blockReason && (
        <p className="mt-2.5 rounded-control bg-subtle px-3 py-2 text-xs leading-relaxed text-muted">
          {resolveCopy(row.blockReason, lexicon)}
        </p>
      )}

      {!blocked && grant && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {limits.length > 0 ? (
            limits.map((limit) => <Badge key={limit}>{limit}</Badge>)
          ) : (
            <span className="text-2xs text-faint">
              No limit set on how often it does this
            </span>
          )}

          {grant.autonomy === "approve" && (
            <span className="text-2xs text-muted">
              {usersLoading ? (
                "Loading approvers…"
              ) : approvers && approvers.length > 0 ? (
                <>
                  Approved by{" "}
                  <span className="font-medium text-ink">
                    {approvers.join(" or ")}
                  </span>
                </>
              ) : (
                <span className="font-medium text-warning">
                  Nobody is named to approve this — the caller waits and nothing
                  happens
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Escalation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The floor under the matrix.
 *
 * Kept as its own band rather than folded into authority, because it is a
 * different kind of rule: the matrix says what the AI may do, and these say when
 * it stops whatever it is doing and fetches a person regardless.
 */
function Escalation({ version }: { version: EmployeeVersion | null }) {
  const pack = useDomainPack();
  const triggers = version?.escalationTriggers ?? [];
  const people = navItemById("people");

  return (
    <Band label="Hands the call to a person when">
      {triggers.length === 0 ? (
        <p className="max-w-prose text-md text-muted">
          Nothing is named. Without a trigger, a caller reaches a person only
          when the AI runs out of things it is allowed to do or is asked
          outright — which is a slower route to the same place, and the caller
          spends the difference.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {/* Deliberately not the reserved `human` hue. That colour answers
                "who is holding this call right now", and a rule about when a
                call *would* be handed over is a different fact — rule 2. */}
            {triggers.map((trigger) => (
              <li key={trigger} className="flex gap-2.5 text-sm">
                <UserRound
                  className="mt-0.5 size-3.5 shrink-0 text-faint"
                  aria-hidden
                />
                <span className="text-ink">{trigger}</span>
              </li>
            ))}
          </ul>

          <p className="mt-3.5 max-w-prose text-xs leading-relaxed text-faint">
            These override the matrix above. Whoever is on call receives the
            handover
            {people && (
              <>
                {" "}
                — the rota that decides who that is at 19:40 lives in{" "}
                <NavLink item={people} pack={pack} />
              </>
            )}
            .
          </p>
        </>
      )}
    </Band>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Manner
// ─────────────────────────────────────────────────────────────────────────────

const SCALES: { key: "warmth" | "formality" | "pace"; low: string; high: string }[] =
  [
    { key: "warmth", low: "Matter of fact", high: "Warm" },
    { key: "formality", low: "Casual", high: "Formal" },
    { key: "pace", low: "Unhurried", high: "Brisk" },
  ];

function Manner({ version }: { version: EmployeeVersion | null }) {
  const persona = version?.persona;
  if (!persona) return null;

  const scalesSet = SCALES.some((scale) => persona[scale.key] !== null);

  return (
    <Band label="Voice and manner">
      <dl className="space-y-4">
        {persona.style && (
          <Fact label="Manner">
            <span className="text-ink">{persona.style}</span>
          </Fact>
        )}

        <Fact label="Languages">
          <span className="flex flex-wrap items-center gap-1.5">
            <Languages className="size-3.5 shrink-0 text-faint" aria-hidden />
            {persona.languages.length === 0 ? (
              <span className="text-faint">None recorded</span>
            ) : (
              persona.languages.map((language) => (
                <Badge key={language} mono>
                  {language}
                </Badge>
              ))
            )}
          </span>
        </Fact>

        <Fact label="Voice">
          {persona.voiceId ? (
            <span className="text-ink">{humanize(persona.voiceId.replace(/^voice_/, ""))}</span>
          ) : (
            <span className="text-faint">
              Not chosen — the channel&apos;s default voice is used
            </span>
          )}
        </Fact>
      </dl>

      {scalesSet ? (
        <div className="mt-5 space-y-3">
          {SCALES.map((scale) => {
            const value = persona[scale.key];
            if (value === null) return null;
            return (
              <Scale
                key={scale.key}
                label={humanize(scale.key)}
                low={scale.low}
                high={scale.high}
                value={value}
              />
            );
          })}
        </div>
      ) : (
        <p className="mt-4 max-w-prose text-sm text-muted">
          The finer controls over how it speaks have never been set on this
          version. Nothing is wrong — it means the manner above is all the
          guidance it has.
        </p>
      )}
    </Band>
  );
}

/**
 * A 0–100 scale, rendered as a position between two named ends rather than as a
 * number. "72" answers nothing; a mark two-thirds of the way towards "Warm" is
 * the fact — and it is deliberately not a percentage, which rule 4 reserves for
 * a claim about confidence this product never makes.
 */
function Scale({
  label,
  low,
  high,
  value,
}: {
  label: string;
  low: string;
  high: string;
  value: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 text-2xs">
        <span className="font-mono tracking-wide text-faint uppercase">
          {label}
        </span>
        <span className="text-muted">
          {low} → {high}
        </span>
      </div>
      <div
        className="mt-1.5 h-1 rounded-full bg-subtle"
        role="img"
        aria-label={`${label}: between ${low} and ${high}, closer to ${value >= 50 ? high : low}`}
      >
        <div
          className="h-1 rounded-full bg-accent"
          style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Deployments
// ─────────────────────────────────────────────────────────────────────────────

function WhereItAnswers({ employee }: { employee: AIEmployee }) {
  const lexicon = useLexicon();
  const pack = useDomainPack();
  const channels = navItemById("channels");

  return (
    <Band
      label="Where it answers"
      action={
        channels ? (
          <span className="text-2xs text-faint">
            Set in <NavLink item={channels} pack={pack} />
          </span>
        ) : undefined
      }
    >
      {employee.deployments.length === 0 ? (
        <div className="rounded-panel border border-line bg-subtle px-4 py-3.5">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <PhoneOff className="size-4 shrink-0 text-faint" aria-hidden />
            No channel is recorded against this {lower(lexicon.employee.one)}
          </p>
          <p className="mt-1.5 max-w-prose text-sm text-muted">
            Nothing here says which number it answers, on what hours, or what a
            caller gets when it is not answering. Until one exists, no caller
            reaches it through anything this workspace has recorded.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {employee.deployments.map((deployment) => (
            <DeploymentCard key={deployment.id} deployment={deployment} />
          ))}
        </div>
      )}
    </Band>
  );
}

function DeploymentCard({ deployment }: { deployment: Deployment }) {
  const hours = summariseHours(deployment.hours);

  return (
    <article className="rounded-panel border border-line bg-elevated px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-ink">
          {CHANNEL_LABEL[deployment.channel]}{" "}
          <span className="font-mono text-xs text-muted tabular">
            {deployment.endpoint}
          </span>
        </p>
        <p className="font-mono text-2xs text-faint tabular">
          {hours.join(" · ")}
        </p>
      </div>

      <div className="mt-2.5 border-t border-line pt-2.5">
        {/* An always-on channel has no "those hours" to be outside of, and a
            heading that names one sends someone looking for a schedule that
            does not exist. Being paused or over budget is still a route to the
            fallback either way. */}
        <p className="font-mono text-2xs tracking-wide text-faint uppercase">
          {deployment.hours.alwaysOn
            ? "While paused, or over budget"
            : "Outside those hours, or while paused"}
        </p>
        <FallbackSummary fallback={deployment.fallback} className="mt-1 text-sm" />
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Grants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the workspace has lent this employee.
 *
 * Employees are granted assets and never own them (§3.1), so each group links
 * to the surface the asset actually lives on — capability-gated, because
 * offering a door onto a wall is what the rest of the shell works to avoid.
 */
function Granted({ version }: { version: EmployeeVersion | null }) {
  const lexicon = useLexicon();
  const pack = useDomainPack();

  const knowledgeQuery = useQuery({
    queryKey: qk.knowledgeSources,
    queryFn: () => service.listKnowledgeSources(),
  });
  const proceduresQuery = useQuery({
    queryKey: qk.procedures,
    queryFn: () => service.listProcedures(),
  });
  const toolsQuery = useQuery({
    queryKey: qk.tools,
    queryFn: () => service.listTools(),
  });

  const assets = useMemo(
    () =>
      grantedAssets(version, {
        knowledge: knowledgeQuery.data ?? [],
        procedures: proceduresQuery.data ?? [],
        tools: toolsQuery.data ?? [],
      }),
    [version, knowledgeQuery.data, proceduresQuery.data, toolsQuery.data],
  );

  const loading =
    knowledgeQuery.isPending || proceduresQuery.isPending || toolsQuery.isPending;

  const total =
    assets.knowledge.length +
    assets.procedures.length +
    assets.tools.length +
    assets.policyIds.length;

  return (
    <Band label="What it has been given">
      {loading ? (
        <SkeletonText lines={3} />
      ) : total === 0 && assets.missing === 0 ? (
        <p className="max-w-prose text-md text-muted">
          Nothing. No source to answer from, no {lower(lexicon.procedure.one)} to
          follow, no connected system to reach — which is why the authority above
          is what it is.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <GrantGroup
              icon={BookOpen}
              label="Knowledge"
              navItemId="knowledge"
              pack={pack}
              names={assets.knowledge.map((source) => source.name)}
              empty="No source it may answer from"
            />
            <GrantGroup
              icon={ClipboardList}
              label={lexicon.procedure.many}
              navItemId="procedures"
              pack={pack}
              names={assets.procedures.map((procedure) => procedure.name)}
              empty={`No ${lower(lexicon.procedure.one)} to follow`}
            />
            <GrantGroup
              icon={Plug}
              label="Tools"
              navItemId="tools"
              pack={pack}
              names={assets.tools.map((tool) => tool.name)}
              empty="No connected system it can reach"
            />
            <GrantGroup
              icon={ScrollText}
              label="Policies"
              pack={pack}
              names={assets.policyIds.map((id) =>
                humanize(id.replace(/^pol_/, "")),
              )}
              empty="No policy applied"
              note="Policies have no surface of their own yet."
            />
          </div>

          {assets.missing > 0 && (
            <p className="mt-3.5 flex items-start gap-2 text-xs text-warning">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              {assets.missing === 1
                ? "One grant points at something that no longer exists."
                : `${assets.missing} grants point at something that no longer exists.`}{" "}
              The AI is configured to use it and will not find it.
            </p>
          )}
        </>
      )}
    </Band>
  );
}

/**
 * One kind of grant.
 *
 * Names rather than a count, because "two collections" is not something anyone
 * can check and "Practice information, Clinical admin" is. An empty group is
 * still rendered: the interesting fact about an employee with no procedures is
 * that it has none, and dropping the group would leave the reader to notice an
 * absence.
 */
function GrantGroup({
  icon: Icon,
  label,
  navItemId,
  pack,
  names,
  empty,
  note,
}: {
  icon: LucideIcon;
  label: string;
  navItemId?: string;
  pack: DomainPack | null;
  names: string[];
  empty: string;
  note?: string;
}) {
  const item = navItemId ? navItemById(navItemId) : null;

  return (
    <div className="rounded-panel border border-line bg-elevated px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 font-mono text-2xs tracking-wide text-faint uppercase">
          <Icon className="size-3.5 shrink-0" aria-hidden />
          {label}
        </p>
        {item && <NavLink item={item} pack={pack} className="text-2xs" />}
      </div>

      {names.length === 0 ? (
        <p className="mt-2 text-sm text-faint">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {names.map((name) => (
            <li key={name} className="text-sm text-ink">
              {name}
            </li>
          ))}
        </ul>
      )}

      {note && <p className="mt-2 text-2xs text-faint">{note}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The draft
// ─────────────────────────────────────────────────────────────────────────────

function DraftWaiting({ employee }: { employee: AIEmployee }) {
  const pack = useDomainPack();
  const draft = employee.draftVersion;

  const releasesQuery = useQuery({
    queryKey: qk.releases(employee.id),
    queryFn: () => service.listReleases(employee.id),
    enabled: draft !== null,
  });
  const runsQuery = useQuery({
    queryKey: qk.simulationRuns,
    queryFn: () => service.listSimulationRuns(),
    enabled: draft !== null,
  });
  const scenariosQuery = useQuery({
    queryKey: qk.scenarios,
    queryFn: () => service.listScenarios(),
    enabled: draft !== null,
  });

  if (!draft) return null;

  const release = (releasesQuery.data ?? []).find(
    (candidate) => candidate.state === "draft",
  );
  const gate = gateForVersion(
    draft.id,
    runsQuery.data ?? [],
    scenariosQuery.data ?? [],
  );

  const releases = navItemById("releases");
  const simulator = navItemById("simulator");

  return (
    <Band
      label="Waiting in the draft"
      action={
        releases ? (
          <span className="text-2xs text-faint">
            Published from <NavLink item={releases} pack={pack} />
          </span>
        ) : undefined
      }
    >
      {!draftDiffers(employee) ? (
        <p className="max-w-prose text-md text-muted">
          The draft matches what is live. There is nothing waiting to be
          published.
        </p>
      ) : (
        <>
          {release && release.changes.length > 0 ? (
            <ReleaseChangeSummary changes={release.changes} />
          ) : (
            <p className="max-w-prose text-md text-muted">
              v{draft.version} differs from what is live, but no release record
              describes the change. It would have to be written up before anyone
              could publish it.
            </p>
          )}

          <div className="mt-4 rounded-panel border border-line bg-subtle px-4 py-3.5">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <FlaskConical className="size-4 shrink-0 text-faint" aria-hidden />
              {gate === null
                ? "Never rehearsed"
                : gate.findings.length === 0
                  ? `Rehearsed clean — ${count(gate.passed, { one: "scenario", many: "scenarios" })} passed`
                  : `${gate.findings.length === 1 ? "One finding" : `${gate.findings.length} findings`} from ${count(gate.total, { one: "scenario", many: "scenarios" })}`}
            </p>

            <p className="mt-1.5 max-w-prose text-sm text-muted">
              {gate === null ? (
                <>
                  Nothing has been run against v{draft.version}, so what it would
                  do to a real caller is an open question.
                  {simulator && (
                    <>
                      {" "}
                      It is answered in <NavLink item={simulator} pack={pack} />.
                    </>
                  )}
                </>
              ) : gate.findings.length === 0 ? (
                <>
                  {gate.lastRunAt && <>Last run {relativeAgo(gate.lastRunAt)}. </>}
                  A clean rehearsal is not a guarantee, but it is the gate this
                  draft has to clear before it reaches a phone line.
                </>
              ) : (
                <>
                  Each of these has to be accepted by name before this draft can
                  be published — a count of warnings is not a decision anyone can
                  take responsibility for.
                </>
              )}
            </p>

            {gate && gate.findings.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {gate.findings.map((finding) => (
                  <li key={finding.id} className="text-xs">
                    <span className="font-medium text-ink">
                      {finding.scenarioName}
                    </span>
                    <span className="text-muted"> — {finding.finding}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Band>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The rail
// ─────────────────────────────────────────────────────────────────────────────

function Facts({
  employee,
  version,
}: {
  employee: AIEmployee;
  version: EmployeeVersion | null;
}) {
  const lexicon = useLexicon();

  const usersQuery = useQuery({
    queryKey: qk.users,
    queryFn: () => service.listUsers(),
  });

  const publisher = version?.publishedBy
    ? usersQuery.data?.find((user) => user.id === version.publishedBy)
    : undefined;

  const supervisors = employee.supervisorUserIds
    .map((id) => usersQuery.data?.find((user) => user.id === id)?.name ?? null)
    .filter((name): name is string => name !== null);

  return (
    <dl className="space-y-4">
      <Fact label="Status">
        <Status tone={EMPLOYEE_STATUS_TONE[employee.status]}>
          {EMPLOYEE_STATUS_LABEL[employee.status]}
        </Status>
      </Fact>

      <Fact label="Showing">
        <span className="text-ink">
          {version ? (
            <>
              v{version.version}{" "}
              <span className="text-faint">
                ({version.state === "live" ? "live" : "draft"})
              </span>
            </>
          ) : (
            "No version"
          )}
        </span>
      </Fact>

      {version?.publishedAt && (
        <Fact label="Published">
          <span className="text-ink">
            {dayAndTime(version.publishedAt)}
            {publisher && <span className="text-faint"> by {publisher.name}</span>}
          </span>
        </Fact>
      )}

      {version?.changeNote && (
        <Fact label="Published because">
          <span className="text-muted">{version.changeNote}</span>
        </Fact>
      )}

      <Fact label="Supervised by">
        {supervisors.length > 0 ? (
          <span className="text-ink">{supervisors.join(", ")}</span>
        ) : (
          <span className="text-warning">
            Nobody — an escalation from this{" "}
            {lower(lexicon.employee.one)} has no named owner
          </span>
        )}
      </Fact>
    </dl>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="font-mono text-2xs tracking-wide text-faint uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A link to another surface, named as that surface names itself and gated on
 * the capability it needs. Someone who cannot open Channels reads the word
 * without a link rather than being sent to a refusal.
 */
function NavLink({
  item,
  pack,
  className,
}: {
  item: NavItem;
  pack: DomainPack | null;
  className?: string;
}) {
  const lexicon = useLexicon();
  const { user } = useWorkspace();
  const label = resolveNavLabel(
    item.id,
    resolveLabel(item.label, lexicon),
    pack,
  );

  if (!hasCapability(user?.capabilities ?? [], item.capability)) {
    return <span className={cn("text-muted", className)}>{label}</span>;
  }

  return (
    <Link
      href={item.href}
      className={cn(
        "text-ink underline underline-offset-4 hover:text-muted",
        className,
      )}
    >
      {label}
    </Link>
  );
}

function NotFound() {
  const lexicon = useLexicon();

  return (
    <Page>
      <BackLink />
      <div className="mt-6">
        <h1 className="font-display text-2xl text-ink">
          There is no {lower(lexicon.employee.one)} with this reference
        </h1>
        <p className="mt-3 max-w-prose text-md text-muted">
          It may have been removed, or the link may be from a different
          workspace — an {lower(lexicon.employee.one)} belongs to the workspace
          that created it and is not readable from another.
        </p>
        <Link
          href="/build/employees"
          className="mt-5 inline-block text-sm font-medium text-ink underline underline-offset-4 hover:text-muted"
        >
          Back to the roster
        </Link>
      </div>
    </Page>
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
        What an {lower(lexicon.employee.one)} is allowed to do is set here. Your
        role works with the results of those decisions rather than the decisions
        themselves.
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
