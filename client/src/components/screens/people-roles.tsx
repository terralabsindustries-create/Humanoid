"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Lock,
  Minus,
  Phone,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import { useLexicon, useWorkspace } from "@/components/providers/app-providers";
import { Button } from "@/components/primitives/button";
import { Badge, Status, StatusPill } from "@/components/primitives/status";
import { EmptyState, ErrorState } from "@/components/primitives/empty-state";
import { LoadingAnnouncement, Skeleton } from "@/components/primitives/skeleton";
import { hasCapability, navItemById, resolveLabel } from "@/lib/navigation";
import {
  CAPABILITIES,
  capabilityById,
  escalationGaps,
  groupCapabilities,
  hasCoverageGap,
  hasDrift,
  heldCount,
  isOwner,
  resolveCopy,
  resolveCover,
  ROLE_CAPABILITIES,
  ROLE_LABEL,
  ROLE_PRESETS,
  ROLE_PURPOSE,
  roleDrift,
  type Cover,
} from "@/lib/domain/people";
import { dayAndTime, now } from "@/lib/utils/time";
import { lower } from "@/lib/lexicon";
import type { Location, OnCallEntry, RolePreset, User } from "@/lib/domain/types";

/**
 * People & roles.
 *
 * The organising decision: this screen is not a permissions table, it is the
 * answer to *who picks up when the AI cannot cope, and are they actually able
 * to?* Everything else is arranged under that question. The rota comes first,
 * before the list of people, because a workspace with immaculate roles and
 * nobody rostered at 19:40 is broken in a way a permissions grid would never
 * show you.
 *
 * The second decision follows from rule 6. Autonomy is granted per capability
 * rather than per AI employee, and the people supervising them work the same
 * way: every gate in the shell checks a capability string, never a role. So a
 * role badge is a summary and the grant beneath it is the fact, and where the
 * two disagree the screen says so — see `roleDrift`. "Operator" on a row beside
 * "backup" on a rota implies someone who can take a call tonight; only the
 * grant knows whether that is true.
 *
 * Two things are writable here — assigning a preset and moving the pager —
 * because they are the screen's stated primary action and a governance surface
 * whose every control is inert is a specification with buttons drawn on it.
 * Both go through the service, which refuses self-demotion and refuses to strip
 * the last owner, so the screen is built against something that says no.
 * Everything else is read-only, and the parts that are locked say why rather
 * than disappearing.
 */
export function PeopleRoles() {
  const { user: viewer, loading: workspaceLoading } = useWorkspace();

  const usersQuery = useQuery({
    queryKey: qk.users,
    queryFn: () => service.listUsers(),
  });
  const rotaQuery = useQuery({
    queryKey: qk.onCall,
    queryFn: () => service.listOnCall(),
  });

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const rota = useMemo(() => rotaQuery.data ?? [], [rotaQuery.data]);
  const cover = useMemo(() => resolveCover(rota, now()), [rota]);

  const byId = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );

  /**
   * Reading who is on call is useful to anyone who might have to escalate;
   * changing it is not. The screen therefore renders in full for everyone who
   * can reach it and locks the controls with the reason attached — the same
   * rule `CapabilityGrant.hardBlocked` follows, and for the same reason: the
   * question "am I allowed to do this?" deserves a visible, explained no.
   */
  const mayManage = hasCapability(viewer?.capabilities ?? [], "people.manage");

  const failed = usersQuery.isError || rotaQuery.isError;
  const pending = usersQuery.isPending || rotaQuery.isPending;

  if (failed) {
    return (
      <Page rail={null}>
        <Header />
        <ErrorState
          title="Could not load people and roles"
          detail="The directory did not respond. Existing permissions are unaffected — this failure is limited to reading them, and nothing has been changed."
          onRetry={() => {
            void usersQuery.refetch();
            void rotaQuery.refetch();
          }}
        />
      </Page>
    );
  }

  return (
    <Page rail={pending ? null : <RolesRail users={users} />}>
      <Header cover={cover} people={byId} loading={pending} />

      {pending ? (
        <PeopleSkeleton />
      ) : users.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="Nobody else here yet"
          description="You are the only person in this workspace. Until someone else is added, every escalation, approval and audit question comes to you."
        />
      ) : (
        <>
          <EscalationPath
            cover={cover}
            people={byId}
            mayManage={mayManage}
            viewerId={viewer?.id}
          />
          <Roster
            users={users}
            rota={rota}
            mayManage={mayManage}
            viewerId={viewer?.id}
            loading={workspaceLoading}
          />
        </>
      )}
    </Page>
  );
}

/**
 * Left-anchored, like every other reading surface in the shell. The width
 * earned above 1280px goes to the four presets — "what does Operator actually
 * mean" is the question this screen provokes most often, and answering it in
 * the margin means you never lose your place in the list to find out.
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
  cover,
  people,
  loading = false,
}: {
  cover?: Cover;
  people?: Map<string, User>;
  loading?: boolean;
}) {
  const primary = cover?.primary ? people?.get(cover.primary.userId) : undefined;

  return (
    <header>
      <p className="font-mono text-2xs tracking-wide text-faint uppercase">
        Control and accountability
      </p>
      <h1 className="mt-1.5 font-display text-3xl text-ink">People &amp; roles</h1>

      {!loading && (
        <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">
          {primary ? (
            <>
              An escalation right now reaches{" "}
              <span className="font-medium text-ink">{primary.name}</span>. A
              role is a shorthand for a set of permissions — the permissions
              are what the system actually checks, so they are what this screen
              shows.
            </>
          ) : (
            <>
              Nobody is currently rostered to receive an escalation. A role is a
              shorthand for a set of permissions — the permissions are what the
              system actually checks, so they are what this screen shows.
            </>
          )}
        </p>
      )}
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The escalation path
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The top of the screen, and the reason it is the top: this is the one fact
 * here that has a deadline attached. The band answers who, with what backup,
 * until when, and — where it applies — what is wrong with that answer.
 */
function EscalationPath({
  cover,
  people,
  mayManage,
  viewerId,
}: {
  cover: Cover;
  people: Map<string, User>;
  mayManage: boolean;
  viewerId: string | undefined;
}) {
  const lexicon = useLexicon();
  const primary = cover.primary ? people.get(cover.primary.userId) : null;
  const gaps = primary ? escalationGaps(primary) : [];
  const channels = navItemById("channels");
  const uncovered = hasCoverageGap(cover);

  return (
    <section
      aria-label="Escalation path"
      className="mt-8 overflow-hidden rounded-panel border border-line bg-elevated"
    >
      <div className="border-b border-line px-4 py-3">
        <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
          When the AI needs a person
        </h2>
      </div>

      <div className="px-4 py-4">
        {primary ? (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="font-display text-2xl text-ink">
                {primary.name}
              </span>
              <StatusPill tone="human" icon={<Phone className="size-3" aria-hidden />}>
                Takes it now
              </StatusPill>
              <Badge>{ROLE_LABEL[primary.role]}</Badge>
            </div>

            {cover.backups.length > 0 ? (
              <p className="mt-2 text-sm text-muted">
                If they do not answer it goes to{" "}
                {joinNames(cover.backups, people)}.
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted">
                There is no backup. If they do not answer, the caller waits.
              </p>
            )}
          </>
        ) : (
          <p className="font-display text-2xl text-ink">Nobody</p>
        )}

        {/* The finding this band exists to make findable: someone rostered to
            receive calls who has not been granted the ability to take one. */}
        {gaps.length > 0 && primary && (
          <Callout tone="danger" icon={TriangleAlert}>
            <p className="text-sm font-medium text-ink">
              {primary.name} cannot act on an escalation.
            </p>
            <p className="mt-1 text-sm text-muted">
              Being on the rota is an intention;{" "}
              {joinList(
                gaps.map((gap) => lower(resolveCopy(gap.label, lexicon))),
              )}{" "}
              {gaps.length === 1 ? "is" : "are"} the mechanism. Handed a{" "}
              {lower(lexicon.conversation.one)} tonight they would be able to
              watch it and nothing else. Assigning them a role that includes it,
              below, fixes this.
            </p>
          </Callout>
        )}

        <dl className="mt-4 grid gap-x-8 gap-y-3 border-t border-line pt-4 sm:grid-cols-2">
          <div>
            <dt className="text-2xs text-faint uppercase">Cover runs until</dt>
            <dd className="mt-0.5 text-sm text-ink">
              {cover.endsAt ? dayAndTime(cover.endsAt) : "Not rostered"}
            </dd>
          </div>
          <div>
            <dt className="text-2xs text-faint uppercase">Then</dt>
            <dd className="mt-0.5 text-sm text-ink">
              {cover.next ? (
                <>
                  {people.get(cover.next.userId)?.name ?? "Someone"} from{" "}
                  {dayAndTime(cover.next.startsAt)}
                </>
              ) : (
                <span className="text-muted">Nobody rostered</span>
              )}
            </dd>
          </div>
        </dl>

        {uncovered && (
          <Callout tone="warning" icon={TriangleAlert}>
            <p className="text-sm text-muted">
              {cover.endsAt ? (
                <>
                  Nothing is rostered after{" "}
                  <span className="text-ink">{dayAndTime(cover.endsAt)}</span>.
                  An escalation raised after that reaches nobody here — what the
                  caller hears instead is the out-of-hours fallback
                </>
              ) : (
                <>
                  An escalation raised now reaches nobody here. What the caller
                  hears instead is the fallback
                </>
              )}
              {channels ? (
                <>
                  , set in{" "}
                  <Link
                    href={channels.href}
                    className="font-medium text-ink underline underline-offset-4 hover:text-muted"
                  >
                    {resolveLabel(channels.label, lexicon)}
                  </Link>
                  .
                </>
              ) : (
                "."
              )}
            </p>
          </Callout>
        )}

        {!mayManage && (
          <LockNote>
            You can see the escalation path but not change it. Handing the pager
            over and assigning roles both need the
            {" "}
            <span className="text-ink">Manage people and roles</span>{" "}
            permission, which your role does not include.
          </LockNote>
        )}

        {mayManage && primary && primary.id === viewerId && (
          <p className="mt-3 text-xs text-faint">
            You are the primary. You can hand the pager to someone else below,
            but you cannot change your own role.
          </p>
        )}
      </div>
    </section>
  );
}

function Callout({
  tone,
  icon: Icon,
  children,
}: {
  tone: "danger" | "warning";
  icon: typeof TriangleAlert;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mt-3 flex items-start gap-2.5 rounded-panel px-3 py-2.5",
        tone === "danger" ? "bg-danger-surface" : "bg-warning-surface",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "danger" ? "text-danger" : "text-warning",
        )}
        aria-hidden
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function LockNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-start gap-2.5 border-t border-line pt-3">
      <Lock className="mt-0.5 size-3.5 shrink-0 text-faint" aria-hidden />
      <p className="text-xs text-muted">{children}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The people
// ─────────────────────────────────────────────────────────────────────────────

function Roster({
  users,
  rota,
  mayManage,
  viewerId,
  loading,
}: {
  users: User[];
  rota: OnCallEntry[];
  mayManage: boolean;
  viewerId: string | undefined;
  loading: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const drifting = users.filter((user) => hasDrift(roleDrift(user))).length;

  return (
    <section aria-label="People" className="mt-9">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
          Everyone with access
        </h2>
        <p className="text-xs text-faint">
          {drifting === 0
            ? "Every grant matches its role."
            : `${drifting} ${drifting === 1 ? "person holds" : "people hold"} something other than their role's set.`}
        </p>
      </div>

      <div className="overflow-hidden rounded-panel border border-line bg-elevated">
        {users.map((user) => (
          <PersonRow
            key={user.id}
            user={user}
            rota={rota}
            open={openId === user.id}
            onToggle={() => setOpenId(openId === user.id ? null : user.id)}
            mayManage={mayManage}
            isViewer={user.id === viewerId}
            loadingSites={loading}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * A person, as a row that opens.
 *
 * Inline disclosure rather than a detail pane: the escalation path above has to
 * stay on screen while you read a grant, because the whole reason to open one
 * is usually a claim the band just made about the person in it.
 */
function PersonRow({
  user,
  rota,
  open,
  onToggle,
  mayManage,
  isViewer,
  loadingSites,
}: {
  user: User;
  rota: OnCallEntry[];
  open: boolean;
  onToggle: () => void;
  mayManage: boolean;
  isViewer: boolean;
  loadingSites: boolean;
}) {
  const drift = roleDrift(user);
  const rostered = rota.find((entry) => entry.userId === user.id);
  const owner = isOwner(user);
  const total = ROLE_CAPABILITIES[user.role].length;

  return (
    <div className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors",
          "hover:bg-subtle",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
        )}
      >
        <ChevronDown
          className={cn(
            "mt-1 size-4 shrink-0 text-faint transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-md font-medium text-ink">{user.name}</span>
            {isViewer && <Badge>You</Badge>}
            <Badge>{ROLE_LABEL[user.role]}</Badge>
            {user.onCall && (
              <Status tone="human" className="text-2xs">
                On call
              </Status>
            )}
            {rostered && !rostered.isPrimary && (
              <span className="text-2xs text-faint">Backup</span>
            )}
          </div>

          <p className="mt-0.5 truncate text-xs text-muted">{user.email}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
            <span className={cn(hasDrift(drift) ? "text-warning" : "text-muted")}>
              {owner
                ? "Every permission"
                : `${heldCount(user)} of the ${total} in this role`}
            </span>
            <span aria-hidden>·</span>
            <SiteSummary user={user} loading={loadingSites} />
          </div>
        </div>
      </button>

      {open && (
        <PersonDetail
          user={user}
          drift={drift}
          mayManage={mayManage}
          isViewer={isViewer}
          isPrimary={rostered?.isPrimary ?? false}
        />
      )}
    </div>
  );
}

function SiteSummary({ user, loading }: { user: User; loading: boolean }) {
  const lexicon = useLexicon();
  const { locations } = useWorkspace();

  if (loading) return <Skeleton className="h-3 w-24" />;

  const named = user.locationIds
    .map((id) => locations.find((location) => location.id === id))
    .filter((location): location is Location => location !== undefined);

  if (named.length === 0) {
    return <span>No {lower(lexicon.location.one)} assigned</span>;
  }
  if (named.length === locations.length && locations.length > 1) {
    return <span>Every {lower(lexicon.location.one)}</span>;
  }
  return <span>{named.map((location) => location.name).join(", ")}</span>;
}

/**
 * The grant, in full.
 *
 * Ordered by what it lets a person do rather than alphabetically, because the
 * question being asked is almost always "can they handle X?" — and grouped, so
 * that a role's shape is legible at a glance rather than as a list of
 * twenty-eight ticks.
 */
function PersonDetail({
  user,
  drift,
  mayManage,
  isViewer,
  isPrimary,
}: {
  user: User;
  drift: ReturnType<typeof roleDrift>;
  mayManage: boolean;
  isViewer: boolean;
  isPrimary: boolean;
}) {
  const lexicon = useLexicon();
  const owner = isOwner(user);

  // An owner holds "*", so their grant is spelled out from the catalogue rather
  // than from their own array — the same way `hasCapability` resolves the
  // wildcard. A capability added to the product later therefore appears here
  // for them automatically, which is exactly what the wildcard means.
  const groups = groupCapabilities(
    owner ? CAPABILITIES.map((capability) => capability.id) : user.capabilities,
  );

  return (
    <div className="border-t border-line bg-subtle/40 px-4 py-4">
      <p className="max-w-prose text-sm text-muted">
        {ROLE_PURPOSE[user.role]}
      </p>

      {hasDrift(drift) && <DriftNote user={user} drift={drift} />}

      <div className="mt-4 space-y-4">
        {owner && (
          <p className="text-sm text-ink">
            As an owner, {user.name} holds every permission below and anything
            added to this product later. That is what makes owner different in
            kind from the other three, rather than just larger.
          </p>
        )}

        {groups.map(({ area, capabilities }) => (
          <div key={area.id}>
            <h4 className="font-mono text-2xs tracking-wide text-faint uppercase">
              {area.label}
            </h4>
            <ul className="mt-1.5 space-y-1.5">
              {capabilities.map((capability) => (
                <li key={capability.id} className="flex items-start gap-2">
                  <Check
                    className="mt-0.5 size-3.5 shrink-0 text-success"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-ink">
                      {resolveCopy(capability.label, lexicon)}
                      {capability.sensitive && (
                        <span className="ml-2 align-middle">
                          <StatusPill tone="warning">Sensitive</StatusPill>
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {resolveCopy(capability.detail, lexicon)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <PersonActions
        user={user}
        mayManage={mayManage}
        isViewer={isViewer}
        isPrimary={isPrimary}
      />
    </div>
  );
}

/**
 * Where the badge and the grant disagree. Stated as the consequence rather than
 * as a diff count: "holds five of the ten" is a number, "cannot do the two
 * things this role exists to do" is a decision.
 */
function DriftNote({
  user,
  drift,
}: {
  user: User;
  drift: ReturnType<typeof roleDrift>;
}) {
  const lexicon = useLexicon();

  const missing = drift.missing
    .map((id) => capabilityById(id))
    .filter((capability) => capability !== null);
  const extra = drift.extra
    .map((id) => capabilityById(id))
    .filter((capability) => capability !== null);

  return (
    <div className="mt-3 rounded-panel bg-warning-surface px-3 py-2.5">
      <p className="text-sm font-medium text-ink">
        This grant does not match the {lower(ROLE_LABEL[user.role])} preset.
      </p>

      {missing.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-muted">
            The role implies these, and {user.name} does not have them:
          </p>
          <ul className="mt-1 space-y-0.5">
            {missing.map((capability) => (
              <li
                key={capability.id}
                className="flex items-start gap-2 text-sm text-ink"
              >
                <Minus className="mt-1 size-3 shrink-0 text-warning" aria-hidden />
                {resolveCopy(capability.label, lexicon)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {extra.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-muted">
            Granted by hand, beyond the role:
          </p>
          <ul className="mt-1 space-y-0.5">
            {extra.map((capability) => (
              <li
                key={capability.id}
                className="flex items-start gap-2 text-sm text-ink"
              >
                <Check className="mt-1 size-3 shrink-0 text-warning" aria-hidden />
                {resolveCopy(capability.label, lexicon)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-2 text-xs text-faint">
        Re-assigning the role below replaces the grant with the preset&apos;s
        set, which is what clears this.
      </p>
    </div>
  );
}

/**
 * The two writes.
 *
 * Both are governance actions, so both name their consequence before they are
 * pressed and report failure verbatim rather than swallowing it — the service
 * refuses self-demotion and refuses to strip the last owner, and a refusal the
 * user cannot read is indistinguishable from a broken button.
 */
function PersonActions({
  user,
  mayManage,
  isViewer,
  isPrimary,
}: {
  user: User;
  mayManage: boolean;
  isViewer: boolean;
  isPrimary: boolean;
}) {
  const queryClient = useQueryClient();

  const assignRole = useMutation({
    mutationFn: (role: RolePreset) =>
      service.assignRole({ userId: user.id, role }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.users });
      // A role change can remove the ability to take an escalation, so the
      // band above has to re-read rather than keep asserting yesterday's answer.
      void queryClient.invalidateQueries({ queryKey: qk.onCall });
      void queryClient.invalidateQueries({ queryKey: qk.me });
    },
  });

  const makePrimary = useMutation({
    mutationFn: () => service.setOnCallPrimary(user.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.onCall });
      void queryClient.invalidateQueries({ queryKey: qk.users });
    },
  });

  const error = assignRole.error ?? makePrimary.error;

  if (!mayManage) return null;

  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="font-mono text-2xs tracking-wide text-faint uppercase">
          Assign a role
        </h4>
        <p className="text-xs text-faint">Replaces the grant above entirely.</p>
      </div>

      {isViewer ? (
        <p className="mt-2 text-sm text-muted">
          You cannot change your own role — that is the one edit that could
          leave this workspace with nobody able to undo it. Another owner or
          governor can.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ROLE_PRESETS.map((preset) => (
            <Button
              key={preset}
              size="sm"
              variant={preset === user.role ? "primary" : "secondary"}
              disabled={preset === user.role || assignRole.isPending}
              loading={assignRole.isPending && assignRole.variables === preset}
              onClick={() => assignRole.mutate(preset)}
            >
              {ROLE_LABEL[preset]}
            </Button>
          ))}
        </div>
      )}

      {!isPrimary && (
        <div className="mt-4">
          <h4 className="font-mono text-2xs tracking-wide text-faint uppercase">
            Escalations
          </h4>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              loading={makePrimary.isPending}
              icon={<Phone className="size-3.5" aria-hidden />}
              onClick={() => makePrimary.mutate()}
            >
              Hand {isViewer ? "yourself" : "them"} the pager
            </Button>
            <p className="text-xs text-faint">
              Takes effect immediately, within the cover window already agreed.
            </p>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs font-medium text-danger">
          {error instanceof Error
            ? error.message
            : "That change was not saved. Nothing has been altered — try again."}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The presets, in the margin
// ─────────────────────────────────────────────────────────────────────────────

function RolesRail({ users }: { users: User[] }) {
  return (
    <div className="sticky top-8 space-y-7">
      <div>
        <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
          The four roles
        </h2>
        <p className="mt-2 text-xs text-muted">
          A preset is a set of permissions with a name, not a rank. Nothing in
          the product checks the name.
        </p>
      </div>

      <div className="space-y-2.5">
        {ROLE_PRESETS.map((preset) => {
          const held = users.filter((user) => user.role === preset);
          return (
            <div
              key={preset}
              className="rounded-panel border border-line bg-elevated px-3 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium text-ink">
                  {ROLE_LABEL[preset]}
                </h3>
                <span className="shrink-0 font-mono text-2xs text-faint tabular">
                  {held.length}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">{ROLE_PURPOSE[preset]}</p>
              <p className="mt-1.5 font-mono text-2xs text-faint">
                {preset === "owner"
                  ? "every permission"
                  : `${ROLE_CAPABILITIES[preset].length} permissions`}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function PeopleSkeleton() {
  return (
    <div className="mt-8" aria-busy>
      <LoadingAnnouncement label="Loading people and roles" />
      <div className="rounded-panel border border-line bg-elevated px-4 py-4">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-6 w-48" />
        <Skeleton className="mt-2.5 h-3.5 w-64" />
      </div>
      <div className="mt-9 overflow-hidden rounded-panel border border-line bg-elevated">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="border-b border-line px-4 py-4 last:border-b-0">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="mt-2 h-3 w-56" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Saoirse Nolan" · "Saoirse Nolan and Daniel Osei" · "A, B and C". */
function joinNames(entries: OnCallEntry[], people: Map<string, User>): string {
  return joinList(
    entries.map((entry) => people.get(entry.userId)?.name ?? "someone"),
  );
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
