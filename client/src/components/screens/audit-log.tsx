"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Cog, Download, Eye, Lock, Search, User, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import { useWorkspace } from "@/components/providers/app-providers";
import { Button } from "@/components/primitives/button";
import { Badge, StatusPill } from "@/components/primitives/status";
import { EmptyState, ErrorState } from "@/components/primitives/empty-state";
import { LoadingAnnouncement, Skeleton } from "@/components/primitives/skeleton";
import {
  ACTOR_LABEL,
  ACTOR_TONE,
  AUDIT_CATEGORY_LABEL,
  auditActionLabel,
  auditCategory,
  categoryFacets,
  filterEvents,
  groupByDay,
  isSensitive,
  type AuditCategory,
} from "@/lib/domain/audit";
import { clockTime, dayHeading, dayKey, relative } from "@/lib/utils/time";
import type { AuditEvent } from "@/lib/domain/types";

/**
 * The audit log.
 *
 * The organising decision: this is a record, not a feed. A feed is read from
 * the top and forgotten; a record is interrogated — someone arrives with a
 * question ("who listened to Mrs Okafor's call?", "when did the AI get
 * permission to reschedule?") and has to leave with an answer they can stand
 * behind. Everything on the screen is arranged for that arrival.
 *
 * Three consequences follow, and they are why this looks different from the
 * other list surfaces in the shell:
 *
 * 1. **Reads are first-class entries.** Most activity screens show what
 *    changed. Here, listening to a recording or revealing a hidden phone
 *    number is exactly as important as publishing a new version — more so, to
 *    the person whose recording it was. Those entries are marked with a shape
 *    and a word, never a tint alone, and the rail counts them separately so
 *    "how much customer data did we touch this week" is answerable at a glance.
 *
 * 2. **The log covers itself.** Exporting is an auditable act, so the export
 *    goes through the service, which writes the `audit.export` entry and hands
 *    it back; the new row then appears at the top of the list the person is
 *    looking at. The screen demonstrates the property rather than asserting it
 *    in prose, which is the only version of that claim worth making.
 *
 * 3. **Nothing here edits anything.** There is no row menu, no resolve, no
 *    dismiss. An audit log with controls on its rows invites the question of
 *    what those controls do to the record, and the answer has to be "nothing"
 *    — so the affordance should not exist in the first place.
 *
 * Actor hue uses the reserved `ai`/`human` pair. That is not a borrowing of
 * rule 2's colours: "was this done by a person or by the AI" is precisely the
 * axis those hues are reserved for, and this screen is where the question is
 * asked in its most consequential form.
 */

type ActorKind = AuditEvent["actor"]["kind"];

const ACTOR_ICON: Record<ActorKind, typeof User> = {
  user: User,
  ai: Bot,
  system: Cog,
};

const ACTOR_TABS: { value: ActorKind | null; label: string }[] = [
  { value: null, label: "Everyone" },
  { value: "user", label: "People" },
  { value: "ai", label: "AI" },
  { value: "system", label: "System" },
];

export function AuditLog() {
  const queryClient = useQueryClient();
  const [actorKind, setActorKind] = useState<ActorKind | null>(null);
  const [category, setCategory] = useState<AuditCategory | null>(null);
  const [search, setSearch] = useState("");
  const [sensitiveOnly, setSensitiveOnly] = useState(false);

  const eventsQuery = useQuery({
    queryKey: qk.audit,
    queryFn: () => service.listAuditEvents(200),
  });

  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);

  const visible = useMemo(
    () => filterEvents(events, { actorKind, category, search, sensitiveOnly }),
    [events, actorKind, category, search, sensitiveOnly],
  );

  const days = useMemo(
    () => groupByDay(visible, (iso) => dayKey(iso)),
    [visible],
  );

  const exportMutation = useMutation({
    mutationFn: () => service.exportAuditEvents(visible.map((e) => e.id)),
    onSuccess: (result) => {
      download(result.filename, result.csv);
      // The export wrote an entry. Refetching is not a nicety here — leaving
      // the list stale would hide the very event the export just created.
      void queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });

  const filtered =
    actorKind !== null ||
    category !== null ||
    sensitiveOnly ||
    search.trim() !== "";

  const clearAll = () => {
    setActorKind(null);
    setCategory(null);
    setSearch("");
    setSensitiveOnly(false);
  };

  if (eventsQuery.isError) {
    return (
      <Page rail={null}>
        <Header />
        <ErrorState
          title="Could not load the audit log"
          detail="The audit service did not respond. Nothing has been lost — entries are written as events happen, not when this screen reads them, so the record is complete and will be here on retry."
          onRetry={() => void eventsQuery.refetch()}
        />
      </Page>
    );
  }

  return (
    <Page
      rail={
        eventsQuery.isPending ? null : (
          <Rail
            events={events}
            facets={categoryFacets(events)}
            selected={category}
            onSelect={setCategory}
          />
        )
      }
    >
      <Header count={events.length} loading={eventsQuery.isPending} />

      {!eventsQuery.isPending && (
        <Toolbar
          search={search}
          onSearch={setSearch}
          actorKind={actorKind}
          onActorKind={setActorKind}
          sensitiveOnly={sensitiveOnly}
          onSensitiveOnly={setSensitiveOnly}
          exporting={exportMutation.isPending}
          exportable={visible.length > 0}
          onExport={() => exportMutation.mutate()}
        />
      )}

      {category && (
        <button
          type="button"
          onClick={() => setCategory(null)}
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1",
            "text-2xs font-medium text-muted transition-colors hover:text-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          )}
        >
          {AUDIT_CATEGORY_LABEL[category]} only
          <X className="size-3" aria-hidden />
          <span className="sr-only">Clear this filter</span>
        </button>
      )}

      {exportMutation.isError && (
        <p className="mt-4 text-sm text-danger" role="alert">
          The export did not complete, so nothing was downloaded and no export
          entry was written. Try again.
        </p>
      )}

      <div className="mt-6">
        {eventsQuery.isPending ? (
          <LogSkeleton />
        ) : days.length > 0 ? (
          <>
            <div className="space-y-8">
              {days.map((day) => (
                <DayGroup key={day.key} dayKey={day.key} events={day.events} />
              ))}
            </div>
            <Footnote shown={visible.length} total={events.length} />
          </>
        ) : (
          <LogEmpty filtered={filtered} onClear={clearAll} />
        )}
      </div>
    </Page>
  );
}

/**
 * Hands the CSV to the browser.
 *
 * Kept as a plain function rather than a hook because it is not React state —
 * it is the one moment this screen touches the DOM directly, and hiding that
 * behind an abstraction would make it harder to see, not easier.
 */
function download(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

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
        <div className="min-w-0 max-w-[54rem] flex-1">{children}</div>
        {rail && (
          <aside className="hidden w-[19rem] shrink-0 xl:block">{rail}</aside>
        )}
      </div>
    </div>
  );
}

function Header({
  count = 0,
  loading = false,
}: {
  count?: number;
  loading?: boolean;
}) {
  return (
    <header>
      <p className="font-mono text-2xs tracking-wide text-faint uppercase">
        Governance
      </p>
      <h1 className="mt-1.5 font-display text-3xl text-ink">Audit log</h1>

      {!loading && (
        <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">
          Every action taken by a person, by an AI employee, or by the system
          itself — including who read a recording, not only who changed
          something. Entries are written as events happen and cannot be edited
          or deleted from here.
        </p>
      )}

      {!loading && count > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-faint">
          <Lock className="size-3" aria-hidden />
          Append-only record · {count.toLocaleString("en-GB")} entries held
        </p>
      )}
    </header>
  );
}

function Toolbar({
  search,
  onSearch,
  actorKind,
  onActorKind,
  sensitiveOnly,
  onSensitiveOnly,
  exporting,
  exportable,
  onExport,
}: {
  search: string;
  onSearch: (value: string) => void;
  actorKind: ActorKind | null;
  onActorKind: (value: ActorKind | null) => void;
  sensitiveOnly: boolean;
  onSensitiveOnly: (value: boolean) => void;
  exporting: boolean;
  exportable: boolean;
  onExport: () => void;
}) {
  return (
    <div className="mt-7 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="sr-only">Search the audit log</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Who, what, or which record…"
            className={cn(
              "h-8 w-full rounded-control border border-line bg-elevated pr-2.5 pl-8",
              "text-sm text-ink placeholder:text-faint",
              "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-focus",
            )}
          />
        </label>

        <Button
          variant="secondary"
          size="sm"
          icon={<Download className="size-3.5" aria-hidden />}
          loading={exporting}
          disabled={!exportable || exporting}
          onClick={onExport}
        >
          Export
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {ACTOR_TABS.map((tab) => (
          <Tab
            key={tab.label}
            label={tab.label}
            active={tab.value === actorKind}
            onClick={() => onActorKind(tab.value)}
          />
        ))}

        <span className="mx-1 h-4 w-px bg-line" aria-hidden />

        <Tab
          label="Data access only"
          icon={<Eye className="size-3" aria-hidden />}
          active={sensitiveOnly}
          onClick={() => onSensitiveOnly(!sensitiveOnly)}
        />
      </div>

      <p className="text-2xs text-faint">
        The export contains exactly the entries shown, and is itself recorded in
        the log.
      </p>
    </div>
  );
}

function Tab({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-sm font-medium",
        "transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        active
          ? "bg-accent-surface text-ink"
          : "text-muted hover:bg-subtle hover:text-ink",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function DayGroup({
  dayKey: key,
  events,
}: {
  dayKey: string;
  events: AuditEvent[];
}) {
  return (
    <section>
      <h2 className="mb-2.5 font-mono text-2xs tracking-wide text-faint uppercase">
        {dayHeading(events[0]?.at ?? key)}
        <span className="ml-2 normal-case">
          {events.length} {events.length === 1 ? "entry" : "entries"}
        </span>
      </h2>
      <div className="overflow-hidden rounded-panel border border-line bg-elevated">
        {events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}

/**
 * One entry.
 *
 * Time is the leftmost column and monospaced, because the first thing anyone
 * does with an audit log is line two entries up against each other. The actor
 * comes before the action for the same reason a witness statement names the
 * person before the deed.
 */
function EventRow({ event }: { event: AuditEvent }) {
  const kind = event.actor.kind;
  const Icon = ACTOR_ICON[kind];
  const sensitive = isSensitive(event);

  return (
    <article className="border-b border-line px-4 py-3.5 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <time
          dateTime={event.at}
          className="font-mono text-2xs text-faint tabular"
          title={`${relative(event.at)} ago`}
        >
          {clockTime(event.at)}
        </time>

        <StatusPill
          tone={ACTOR_TONE[kind]}
          icon={<Icon className="size-3" aria-hidden />}
        >
          {ACTOR_LABEL[kind]}
        </StatusPill>

        <span className="text-sm font-medium text-ink">{event.actor.label}</span>

        {sensitive && (
          <span className="inline-flex items-center gap-1 text-2xs font-medium text-warning">
            <Eye className="size-3" aria-hidden />
            Data access
          </span>
        )}
      </div>

      <p className="mt-1.5 text-sm text-ink">
        {auditActionLabel(event.action)}
        <Badge className="ml-2" mono>
          {event.target}
        </Badge>
      </p>

      <p className="mt-1 text-sm text-muted">{event.detail}</p>

      <p className="mt-1.5 font-mono text-2xs text-faint">
        {AUDIT_CATEGORY_LABEL[auditCategory(event.action)]} · {event.action} ·{" "}
        {event.id}
      </p>
    </article>
  );
}

/**
 * The rail answers the two questions a governance reader brings with them:
 * how much of this was customer data being read, and what kind of activity
 * dominates the period.
 */
function Rail({
  events,
  facets,
  selected,
  onSelect,
}: {
  events: AuditEvent[];
  facets: ReturnType<typeof categoryFacets>;
  selected: AuditCategory | null;
  onSelect: (category: AuditCategory | null) => void;
}) {
  const { user } = useWorkspace();
  const sensitiveCount = events.filter(isSensitive).length;

  if (facets.length === 0) return null;

  return (
    <div className="sticky top-8 space-y-7">
      <div>
        <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
          Customer data touched
        </h2>
        <p className="mt-2 font-display text-2xl text-ink tabular">
          {sensitiveCount.toLocaleString("en-GB")}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {sensitiveCount === 1 ? "entry is" : "entries are"} a recording played,
          a hidden detail revealed, or an export taken — rather than a
          configuration change
        </p>
      </div>

      <div>
        <h2 className="mb-2.5 font-mono text-2xs tracking-wide text-faint uppercase">
          By activity
        </h2>
        <div className="overflow-hidden rounded-panel border border-line bg-elevated">
          {facets.map((facet) => {
            const active = facet.category === selected;
            return (
              <button
                key={facet.category}
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(active ? null : facet.category)}
                className={cn(
                  "flex w-full items-baseline justify-between gap-3 border-b border-line px-3 py-2.5 text-left last:border-b-0",
                  "transition-colors",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
                  active ? "bg-accent-surface" : "hover:bg-subtle",
                )}
              >
                <span className="min-w-0 flex-1 truncate text-xs text-ink">
                  {AUDIT_CATEGORY_LABEL[facet.category]}
                </span>
                <span className="shrink-0 font-mono text-2xs text-faint tabular">
                  {facet.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {user && (
        <p className="text-2xs leading-relaxed text-faint">
          You are reading this as {user.name}. Reading the log is not itself
          recorded; exporting it is.
        </p>
      )}
    </div>
  );
}

function Footnote({ shown, total }: { shown: number; total: number }) {
  return (
    <p className="mt-6 text-xs text-faint">
      {shown === total ? (
        <>
          Showing all {total.toLocaleString("en-GB")} entries held for this
          workspace.
        </>
      ) : (
        <>
          Showing {shown.toLocaleString("en-GB")} of{" "}
          {total.toLocaleString("en-GB")} entries.
        </>
      )}{" "}
      Retention is set in Compliance; entries are removed only by that policy,
      never by hand.
    </p>
  );
}

function LogEmpty({
  filtered,
  onClear,
}: {
  filtered: boolean;
  onClear: () => void;
}) {
  if (filtered) {
    return (
      <EmptyState
        tone="quiet"
        title="Nothing matches those filters"
        description="No entry in the log matches what you are looking for. That is an answer in itself — but widen the search before relying on it."
        action={
          <button
            type="button"
            onClick={onClear}
            className="text-sm font-medium text-ink underline underline-offset-4 hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Clear every filter
          </button>
        }
      />
    );
  }

  return (
    <EmptyState
      title="Nothing has been recorded yet"
      description="Entries appear here as soon as anyone — a person, an AI employee, or the system — does something worth accounting for. Signing in, answering a call, playing a recording and publishing a change all qualify."
    />
  );
}

function LogSkeleton() {
  return (
    <div aria-busy>
      <LoadingAnnouncement label="Loading the audit log" />
      <Skeleton className="h-3 w-24" />
      <div className="mt-2.5 overflow-hidden rounded-panel border border-line bg-elevated">
        {[0, 1, 2, 3].map((row) => (
          <div
            key={row}
            className="border-b border-line px-4 py-3.5 last:border-b-0"
          >
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-2 h-3.5 w-2/3" />
            <Skeleton className="mt-2 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
