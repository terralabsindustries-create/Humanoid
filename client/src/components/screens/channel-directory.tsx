"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Clock,
  Hash,
  Mail,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Phone,
  PhoneOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import { useScope } from "@/lib/store/scope";
import {
  useDomainPack,
  useLexicon,
  useWorkspace,
} from "@/components/providers/app-providers";
import { hasCapability, navItemById, resolveLabel } from "@/lib/navigation";
import { resolveNavLabel } from "@/lib/domains/registry";
import { Button } from "@/components/primitives/button";
import { StatusPill } from "@/components/primitives/status";
import { EmptyState, ErrorState } from "@/components/primitives/empty-state";
import { LoadingAnnouncement, Skeleton } from "@/components/primitives/skeleton";
import {
  FallbackEditor,
  FallbackSummary,
  FALLBACK_ICON,
} from "@/components/domain/fallback-path";
import {
  CHANNEL_LABEL,
  EMPLOYEE_STATUS_LABEL,
  EMPLOYEE_STATUS_TONE,
  NUMBER_STATUS_LABEL,
  NUMBER_STATUS_TONE,
} from "@/lib/domain/labels";
import {
  buildRoutes,
  describeFallback,
  nextHoursChange,
  resolveReach,
  routesInScope,
  summariseHours,
  untilLabel,
  type ChannelRoute,
  type HoursChange,
  type RouteReach,
} from "@/lib/domain/channels";
import { now } from "@/lib/utils/time";
import { count, lower } from "@/lib/lexicon";
import type {
  AIEmployee,
  Channel,
  FallbackBehaviour,
  PhoneNumber,
} from "@/lib/domain/types";

/**
 * Channels & numbers.
 *
 * The question this screen answers is not "what is configured" but "if I ring
 * this number right now, what happens". Those are different questions, and a
 * settings table only answers the first — which is why a dead number can sit
 * in one for a month without anybody noticing. A phone number and an AI
 * employee's decision to answer it are two separate objects, and the failure
 * that matters lives in the gap between them: a number marked active, assigned
 * to a published employee, that no deployment carries. It rings out. Both
 * halves look fine on their own.
 *
 * So the unit here is the route — the join — and every card leads with the
 * consequence at this moment rather than with the settings that produce it.
 * The settings are underneath, because the second question is always "why".
 *
 * The one thing this screen writes is the fallback path, which is the setting
 * least likely to be checked and the most expensive to get wrong: nothing
 * looks broken until the hour nobody is watching.
 */

const CHANNEL_ICON: Record<Channel, LucideIcon> = {
  voice: Phone,
  sms: MessageSquare,
  whatsapp: MessageCircle,
  webchat: MessagesSquare,
  email: Mail,
};

/**
 * `ai` is the reserved hue and this is its reserved meaning — an AI employee
 * is the thing answering this line. `info` for the fallback rather than a
 * warning: handing over at closing time is the configuration working.
 */
const REACH_TEXT: Record<RouteReach["lands"], string> = {
  ai: "text-ai",
  fallback: "text-info",
  nobody: "text-danger",
};

/**
 * Not lexicon entries. "A way into the business" and "a phone number" mean the
 * same thing in a clinic and a law firm — the industry-variable noun on this
 * screen is the AI employee, and that one does resolve through `useLexicon()`.
 */
const WAY_IN = { one: "way in", many: "ways in" };
const NUMBER_TERM = { one: "number", many: "numbers" };

type RouteRow = {
  route: ChannelRoute;
  reach: RouteReach;
  /** The site's own timezone — hours are wall-clock there, not here. */
  timezone: string;
};

export function ChannelDirectory() {
  const scope = useScope();
  const { workspace, locations, user, loading } = useWorkspace();

  const numbersQuery = useQuery({
    queryKey: qk.phoneNumbers,
    queryFn: () => service.listPhoneNumbers(),
  });
  const employeesQuery = useQuery({
    queryKey: qk.employees,
    queryFn: () => service.listEmployees(),
  });

  // One instant for the whole screen. Resolving each card against its own
  // `now` would let two cards disagree about whether it is 17:00 yet.
  const at = useMemo(() => new Date(now()), []);

  const numbers = useMemo(() => numbersQuery.data ?? [], [numbersQuery.data]);
  const employees = useMemo(
    () => employeesQuery.data ?? [],
    [employeesQuery.data],
  );

  const rows = useMemo<RouteRow[]>(() => {
    const zoneFor = (locationId: string | null) =>
      locations.find((site) => site.id === locationId)?.timezone ??
      workspace?.timezone ??
      "Europe/London";

    return routesInScope(buildRoutes(numbers, employees), scope).map(
      (route) => {
        const timezone = zoneFor(route.locationId);
        return { route, timezone, reach: resolveReach(route, at, timezone) };
      },
    );
  }, [numbers, employees, scope, locations, workspace?.timezone, at]);

  const canManage = hasCapability(user?.capabilities ?? [], "channel.manage");
  const pending = numbersQuery.isPending || employeesQuery.isPending || loading;
  const failed = numbersQuery.isError || employeesQuery.isError;

  return (
    <div className="px-5 py-8 sm:px-8 sm:py-12 xl:px-10">
      <div className="flex gap-10 2xl:gap-14">
        <div className="min-w-0 max-w-[52rem] flex-1">
          <header>
            <p className="font-mono text-2xs tracking-wide text-faint uppercase">
              Ways in
            </p>
            <h1 className="mt-1.5 font-display text-3xl text-ink">
              Channels &amp; numbers
            </h1>
            {!pending && !failed && rows.length > 0 && <Lede rows={rows} />}
          </header>

          {!pending && !failed && rows.length > 0 && !canManage && (
            <p className="mt-6 rounded-panel border border-line bg-subtle px-3.5 py-3 text-xs leading-relaxed text-muted">
              You can read all of this. Changing where a caller lands is
              restricted to an owner or a governor — if one of these paths is
              wrong, that is who to tell.
            </p>
          )}

          <div className="mt-7">
            {failed ? (
              <ErrorState
                title="Could not load your channels"
                detail="Nothing here has changed — this screen could not read it. Calls in progress are unaffected."
                onRetry={() => {
                  void numbersQuery.refetch();
                  void employeesQuery.refetch();
                }}
              />
            ) : pending ? (
              <ListSkeleton />
            ) : rows.length === 0 ? (
              <NothingConfigured scoped={scope.locationId !== null} />
            ) : (
              <div className="overflow-hidden rounded-panel border border-line bg-elevated">
                {rows.map((row) => (
                  <RouteCard
                    key={row.route.id}
                    row={row}
                    at={at}
                    canManage={canManage}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {!pending && !failed && rows.length > 0 && (
          <aside className="hidden w-[19rem] shrink-0 xl:block">
            <Rail rows={rows} at={at} />
          </aside>
        )}
      </div>
    </div>
  );
}

/**
 * The lede states the failure count first when there is one. "Four channels
 * configured" is the fact a settings screen would open with, and it is the one
 * fact here that cannot tell you whether anything is wrong.
 */
function Lede({ rows }: { rows: RouteRow[] }) {
  const lexicon = useLexicon();
  const unreachable = rows.filter((row) => row.reach.lands === "nobody").length;
  const onFallback = rows.filter((row) => row.reach.lands === "fallback").length;

  return (
    <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">
      {unreachable > 0 ? (
        <>
          <span className="font-medium text-ink tabular">{unreachable}</span> of
          the {count(rows.length, WAY_IN)} to this business{" "}
          {unreachable === 1 ? "reaches" : "reach"} nobody right now — a caller
          who tries {unreachable === 1 ? "it" : "one of them"} hears it ring
          out.
        </>
      ) : onFallback > 0 ? (
        <>
          Every way in reaches someone.{" "}
          <span className="font-medium text-ink tabular">{onFallback}</span>{" "}
          {onFallback === 1 ? "is" : "are"} on a fallback path rather than your{" "}
          {lower(lexicon.employee.one)} right now.
        </>
      ) : (
        <>
          All {count(rows.length, WAY_IN)} are being answered right
          now.
        </>
      )}
    </p>
  );
}

function RouteCard({
  row,
  at,
  canManage,
}: {
  row: RouteRow;
  at: Date;
  canManage: boolean;
}) {
  return (
    <article className="border-b border-line px-4 py-5 last:border-b-0 sm:px-5">
      <Heading route={row.route} />
      <Reach row={row} at={at} />
      {row.route.deployment ? (
        <Configured row={row} canManage={canManage} />
      ) : (
        <Gap route={row.route} />
      )}
    </article>
  );
}

function Heading({ route }: { route: ChannelRoute }) {
  const lexicon = useLexicon();
  const { locations } = useWorkspace();

  const site = locations.find((one) => one.id === route.locationId) ?? null;
  const Icon = route.channel ? CHANNEL_ICON[route.channel] : Hash;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <h2 className="text-md font-medium text-ink">
          {route.label ?? route.endpoint}
        </h2>

        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <Icon className="size-3.5 shrink-0 text-faint" aria-hidden />
          {route.channel ? CHANNEL_LABEL[route.channel] : "No channel"}
        </span>

        {route.number && route.number.status !== "active" && (
          <StatusPill
            tone={NUMBER_STATUS_TONE[route.number.status]}
            className="text-2xs"
          >
            {NUMBER_STATUS_LABEL[route.number.status]}
          </StatusPill>
        )}

        {locations.length > 1 && (
          <span className="text-2xs text-faint">
            {site ? site.name : `Every ${lower(lexicon.location.one)}`}
          </span>
        )}
      </div>

      {route.label && (
        <p className="mt-1 font-mono text-xs text-faint tabular">
          {route.endpoint}
        </p>
      )}
    </div>
  );
}

/** What a caller gets, said before anything that explains it. */
function Reach({ row, at }: { row: RouteRow; at: Date }) {
  const lexicon = useLexicon();
  const { route, reach, timezone } = row;

  const employeeName = employeeLabel(route.employee, lexicon.employee.one);
  const hours = route.deployment?.hours ?? null;
  const change = hours ? nextHoursChange(hours, at, timezone) : null;

  let Icon: LucideIcon = PhoneOff;
  let headline = "Nothing answers this";
  let detail: React.ReactNode = null;

  if (reach.lands === "ai") {
    Icon = Bot;
    headline = `${employeeName} is answering`;
    detail = hours?.alwaysOn ? (
      <>Always on — there is no scheduled handover.</>
    ) : change ? (
      <>
        Open until {whenPhrase(change)}, another {untilLabel(change.inMinutes)}.
      </>
    ) : (
      <>Answering now.</>
    );
  } else if (reach.lands === "fallback" && route.deployment) {
    const fallback = route.deployment.fallback;
    Icon = FALLBACK_ICON[fallback.kind];
    headline = describeFallback(fallback).headline;
    detail =
      reach.because === "out_of_hours" ? (
        change ? (
          <>
            Outside opening hours. {employeeName} picks up again at{" "}
            {whenPhrase(change)}, in {untilLabel(change.inMinutes)}.
          </>
        ) : (
          <>Outside opening hours.</>
        )
      ) : reach.because === "paused" ? (
        <>
          {employeeName} is paused, so this is what every caller gets at every
          hour until someone resumes it.
        </>
      ) : (
        <>
          {employeeName} has not been published, so this is what every caller
          gets.
        </>
      );
  } else if (reach.lands === "nobody") {
    detail =
      reach.because === "provisioning" ? (
        <>
          The number is still being connected and cannot receive anything until
          that finishes.
        </>
      ) : reach.because === "no_employee" ? (
        <>
          No {lower(lexicon.employee.one)} is assigned to it, and nothing is
          deployed on it.
        </>
      ) : (
        <>
          It is assigned to {employeeName}, but no channel is deployed on it —
          being assigned is not the same as being answered.
        </>
      );
  }

  return (
    <div className="mt-3.5 flex items-start gap-2">
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", REACH_TEXT[reach.lands])}
        aria-hidden
      />
      <div className="min-w-0">
        <p className={cn("text-sm font-medium", REACH_TEXT[reach.lands])}>
          {headline}
        </p>
        {detail && <p className="mt-0.5 text-xs text-muted">{detail}</p>}
      </div>
    </div>
  );
}

/** Hours and fallback — the two settings that produce everything above. */
function Configured({
  row,
  canManage,
}: {
  row: RouteRow;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const deployment = row.route.deployment;
  const deploymentId = deployment?.id ?? null;

  const save = useMutation({
    mutationFn: (fallback: FallbackBehaviour) => {
      if (!deploymentId) throw new Error("This route has no deployment.");
      return service.setDeploymentFallback({ deploymentId, fallback });
    },
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: qk.employees });
    },
  });

  if (!deployment) return null;

  const employeeStatus = row.route.employee?.status ?? null;

  return (
    <div className="mt-4 border-t border-line pt-3.5">
      <dl className="space-y-2.5 text-sm">
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          <dt className="w-20 shrink-0 text-xs text-faint">Hours</dt>
          <dd className="min-w-0 flex-1 text-xs text-muted">
            {summariseHours(deployment.hours).join(" · ")}
          </dd>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          <dt className="w-20 shrink-0 text-xs text-faint">Otherwise</dt>
          <dd className="min-w-0 flex-1 text-xs">
            {editing ? (
              <FallbackEditor
                fallback={deployment.fallback}
                pending={save.isPending}
                error={
                  save.isError
                    ? "That did not save. The path is unchanged — try again."
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
                <FallbackSummary fallback={deployment.fallback} />
                {canManage && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditing(true)}
                  >
                    Change
                  </Button>
                )}
              </div>
            )}
          </dd>
        </div>

        {employeeStatus && employeeStatus !== "live" && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            <dt className="w-20 shrink-0 text-xs text-faint">Employee</dt>
            <dd className="min-w-0 flex-1">
              <StatusPill
                tone={EMPLOYEE_STATUS_TONE[employeeStatus]}
                className="text-2xs"
              >
                {EMPLOYEE_STATUS_LABEL[employeeStatus]}
              </StatusPill>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/**
 * A number nothing answers. There is nothing to configure here, so this says
 * what the number can carry and where the missing half is made — naming the
 * destination rather than offering a button that would have to invent one.
 */
function Gap({ route }: { route: ChannelRoute }) {
  const lexicon = useLexicon();
  const pack = useDomainPack();
  const { user } = useWorkspace();

  const item = navItemById("employees");
  const destination = item
    ? resolveNavLabel(item.id, resolveLabel(item.label, lexicon), pack)
    : null;
  const mayBuild = hasCapability(user?.capabilities ?? [], "employee.edit");

  return (
    <div className="mt-4 border-t border-line pt-3.5 text-xs leading-relaxed text-muted">
      {route.number && route.number.capabilities.length > 0 && (
        <p>
          The number can carry{" "}
          {joinWords(
            route.number.capabilities.map((channel) =>
              lower(CHANNEL_LABEL[channel]),
            ),
          )}
          .
        </p>
      )}

      {destination && item && (
        <p className="mt-1.5 text-faint">
          A channel is attached to an {lower(lexicon.employee.one)}, not to the
          number.{" "}
          {mayBuild ? (
            <>
              Add one in{" "}
              <Link
                href={item.href}
                className="font-medium text-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
              >
                {destination}
              </Link>
              .
            </>
          ) : (
            <>Adding one happens in {destination}, which needs build access.</>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * The rail answers the second question — "and when does that change?" — which
 * is the one nobody can work out from a table of opening hours in their head.
 */
function Rail({ rows, at }: { rows: RouteRow[]; at: Date }) {
  const lexicon = useLexicon();

  const reaching = rows.filter((row) => row.reach.lands !== "nobody").length;

  const upcoming = rows
    .flatMap((row) => {
      const hours = row.route.deployment?.hours;
      if (!hours || row.reach.lands === "nobody") return [];
      const change = nextHoursChange(hours, at, row.timezone);
      return change ? [{ row, change }] : [];
    })
    .sort((a, b) => a.change.inMinutes - b.change.inMinutes)
    .slice(0, 4);

  const numbers = new Map<string, PhoneNumber>();
  for (const row of rows) {
    if (row.route.number) numbers.set(row.route.number.id, row.route.number);
  }
  const monthly = [...numbers.values()].reduce(
    (total, number) => total + number.monthlyCost,
    0,
  );

  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
          Reaching someone
        </h2>
        <p className="mt-2 font-display text-2xl text-ink tabular">
          {reaching} of {rows.length}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {rows.length === 1 ? "way in" : "ways in"} answered right now
        </p>
      </section>

      {upcoming.length > 0 && (
        <section>
          <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
            Changing hands
          </h2>
          <ul className="mt-2.5 space-y-2.5">
            {upcoming.map(({ row, change }) => (
              <li
                key={row.route.id}
                className="rounded-control border border-line bg-elevated px-3 py-2.5"
              >
                <p className="truncate text-xs font-medium text-ink">
                  {row.route.label ?? row.route.endpoint}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-2xs text-muted">
                  <Clock className="size-3 shrink-0 text-faint" aria-hidden />
                  {change.opens
                    ? `Picks up at ${whenPhrase(change)}`
                    : `Hands over at ${whenPhrase(change)}`}
                </p>
                <p className="mt-0.5 pl-4.5 text-2xs text-faint tabular">
                  in {untilLabel(change.inMinutes)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {numbers.size > 0 && (
        <section>
          <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
            Numbers
          </h2>
          <p className="mt-2 text-xs text-muted">
            {count(numbers.size, NUMBER_TERM)} on this account
            {monthly > 0 && (
              <>
                {" · "}
                <span className="tabular">£{monthly.toFixed(2)}</span> a month
              </>
            )}
            .
          </p>
          <p className="mt-1.5 text-2xs leading-relaxed text-faint">
            Buying and releasing numbers is not built yet — these were
            provisioned when your {lower(lexicon.employee.one)} was set up.
          </p>
        </section>
      )}
    </div>
  );
}

function NothingConfigured({ scoped }: { scoped: boolean }) {
  const lexicon = useLexicon();

  return scoped ? (
    <EmptyState
      tone="quiet"
      title={`No way in is assigned to this ${lower(lexicon.location.one)}`}
      description="Numbers that ring for the whole group would show here too, so nothing at all is pointed at this site. Widen the scope to see the rest."
    />
  ) : (
    <EmptyState
      tone="quiet"
      title="No numbers yet"
      description={`When your ${lower(lexicon.employee.one)} is given a phone number, it appears here with its hours and what happens to a caller when the ${lower(lexicon.employee.one)} is not the one answering.`}
    />
  );
}

function ListSkeleton() {
  return (
    <div className="overflow-hidden rounded-panel border border-line bg-elevated">
      <LoadingAnnouncement label="Loading channels and numbers" />
      {[0, 1, 2].map((row) => (
        <div key={row} className="space-y-2.5 border-b border-line px-5 py-5 last:border-b-0">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-64" />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/** "17:00 today" / "08:00 Monday". */
function whenPhrase(change: HoursChange): string {
  return `${change.clock} ${change.today ? "today" : change.day}`;
}

/**
 * The persona's name is what the caller hears, so it is what an operator
 * should read here. The live version wins over the draft: this screen is about
 * what is happening on the phone right now, not what is queued to happen.
 */
function employeeLabel(employee: AIEmployee | null, fallback: string): string {
  return (
    employee?.liveVersion?.persona.name ??
    employee?.draftVersion?.persona.name ??
    fallback
  );
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}
