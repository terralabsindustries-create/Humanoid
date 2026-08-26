"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bot, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service, type RecordFilters } from "@/lib/services";
import { useScope } from "@/lib/store/scope";
import { useLexicon, useWorkspace } from "@/components/providers/app-providers";
import { EmptyState, ErrorState } from "@/components/primitives/empty-state";
import { Skeleton } from "@/components/primitives/skeleton";
import { Input } from "@/components/primitives/input";
import { Button } from "@/components/primitives/button";
import {
  RecordStatus,
  RecordStatusInline,
} from "@/components/domain/record-status";
import { humanize, recordTypeLabel } from "@/lib/domain/labels";
import {
  clockTime,
  dayAndTime,
  dayHeading,
  dayKey,
  now,
  
  relativeAgo,
} from "@/lib/utils/time";
import { lower, withArticle } from "@/lib/lexicon";
import type {
  DomainRecord,
  Location,
  Party,
  RecordArchetype,
  Resource,
} from "@/lib/domain/types";

/**
 * Records.
 *
 * The diary, and the answer to "what did the AI actually do to it". Every row
 * here is a thing that exists in the business because of a conversation — or
 * pointedly did not come from one, which is the comparison that makes the
 * surface worth opening.
 *
 * It is read as a day book rather than a table: grouped by the day a slot falls
 * on, soonest first, with the past behind it. A table sorted by a column header
 * is a database viewer; a diary is what the person at the front desk is
 * actually holding.
 *
 * Nothing here names an industry. The heading is the archetype's word in this
 * workspace's language, so the identical component reads "Appointments" in a
 * clinic and "Reservations" in a hotel.
 */

/** Canonical order, so the tabs do not reshuffle as data arrives. */
const ARCHETYPE_ORDER: RecordArchetype[] = [
  "visit",
  "case",
  "lead",
  "order",
  "party",
  "resource",
];

type Tab = RecordArchetype | "all";

export function Records() {
  const lexicon = useLexicon();
  const { workspace, locations } = useWorkspace();

  // Selecting the two fields rather than the whole store keeps the query key
  // stable across the store's own hydration, which would otherwise refetch
  // every list on mount for a scope that has not actually changed.
  const locationId = useScope((s) => s.locationId);
  const departmentId = useScope((s) => s.departmentId);
  const scope = useMemo(
    () => ({ locationId, departmentId }),
    [locationId, departmentId],
  );

  const [tab, setTab] = useState<Tab>("visit");
  const [search, setSearch] = useState("");
  const [aiOnly, setAiOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /**
   * The unfiltered set for this scope. It exists to build the tabs and their
   * counts: deriving them from the filtered list would delete the tab you are
   * standing on the moment a search matches nothing, which is how a filter bar
   * becomes a trap.
   */
  const censusQuery = useQuery({
    queryKey: qk.records({ scope }),
    queryFn: () => service.listRecords({ scope }),
  });

  const filters: RecordFilters = useMemo(
    () => ({
      scope,
      archetype: tab === "all" ? undefined : [tab],
      search: search.trim() || undefined,
      createdByAiOnly: aiOnly || undefined,
    }),
    [scope, tab, search, aiOnly],
  );

  const recordsQuery = useQuery({
    queryKey: qk.records(filters),
    queryFn: () => service.listRecords(filters),
  });

  // Names for the rows. Fetched unscoped on purpose: a record inside the
  // current scope can belong to someone whose home site is a different one,
  // and a row reading "Unknown" because of that would be a bug wearing an
  // empty state's clothes.
  const partiesQuery = useQuery({
    queryKey: qk.parties(),
    queryFn: () => service.listParties(),
  });
  const resourcesQuery = useQuery({
    queryKey: qk.resources,
    queryFn: () => service.listResources(),
  });

  const timezone = workspace?.timezone ?? "Europe/London";
  // Memoised so the empty-array fallback does not hand the grouping and census
  // memos a fresh identity on every render.
  const records = useMemo(() => recordsQuery.data ?? [], [recordsQuery.data]);
  const census = useMemo(() => censusQuery.data ?? [], [censusQuery.data]);

  const partiesById = useIndex(partiesQuery.data);
  const resourcesById = useIndex(resourcesQuery.data);
  const locationsById = useIndex(locations);

  const tabs = useMemo(() => {
    const counts = new Map<RecordArchetype, number>();
    for (const record of census) {
      counts.set(record.archetype, (counts.get(record.archetype) ?? 0) + 1);
    }
    return ARCHETYPE_ORDER.filter((a) => counts.has(a)).map((archetype) => ({
      archetype,
      count: counts.get(archetype) ?? 0,
    }));
  }, [census]);

  const groups = useMemo(
    () => groupByDay(records, timezone),
    [records, timezone],
  );

  const selected =
    records.find((r) => r.id === selectedId) ??
    null;

  const filtered = search.trim() !== "" || aiOnly;
  const heading =
    tab === "all" ? "Records" : lexicon[tab].many;

  if (recordsQuery.isError) {
    return (
      <Page aside={null}>
        <ErrorState
          title={`Could not load ${lower(heading)}`}
          detail="The records service did not respond. Nothing has been changed — this screen only reads."
          onRetry={() => recordsQuery.refetch()}
        />
      </Page>
    );
  }

  const detail = selected ? (
    <RecordDetail
      record={selected}
      party={selected.partyId ? partiesById.get(selected.partyId) : undefined}
      resource={
        selected.resourceId ? resourcesById.get(selected.resourceId) : undefined
      }
      location={locationsById.get(selected.locationId)}
      timezone={timezone}
    />
  ) : null;

  return (
    <Page
      aside={
        detail ?? (
          <p className="rounded-panel border border-line bg-elevated px-3.5 py-6 text-xs text-muted">
            Select{" "}
            {tab === "all" ? "a record" : withArticle(lexicon[tab].one)} to see
            what it holds and the {lower(lexicon.conversation.one)} that
            produced it.
          </p>
        )
      }
    >
      <header className="mb-6">
        <p className="font-mono text-2xs tracking-wide text-faint uppercase">
          {scope.locationId
            ? (locationsById.get(scope.locationId)?.name ?? "This site")
            : `All ${lower(lexicon.location.many)}`}
        </p>
        <h1 className="mt-1.5 font-display text-3xl text-ink">{heading}</h1>
        {/* `employee` is the one term that must not go through `lower()` — it
            begins with an acronym, and "aI employees" is the result. */}
        <p className="mt-2 max-w-prose text-md text-muted">
          Everything your {lexicon.employee.many} created or changed, alongside
          what was already in the book.
        </p>
      </header>

      <div className="mb-5 space-y-3">
        <Tabs
          tabs={tabs}
          value={tab}
          onChange={(next) => {
            setTab(next);
            setSelectedId(null);
          }}
          total={census.length}
          label={lexicon}
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-72">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-faint"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${lower(heading)}`}
              aria-label={`Search ${lower(heading)}`}
              className="h-8 pl-8 text-sm"
            />
          </div>

          {/* The provenance cut. A switch rather than a filter chip because it
              is a different question from "which kind" — it asks who did it. */}
          <button
            type="button"
            role="switch"
            aria-checked={aiOnly}
            onClick={() => setAiOnly((v) => !v)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control px-2.5",
              "border text-xs font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              aiOnly
                ? "border-transparent bg-ai-surface text-ai"
                : "border-line-strong bg-elevated text-muted hover:text-ink",
            )}
          >
            <Bot className="size-3.5" aria-hidden />
            Created on {withArticle(lexicon.call.one)}
          </button>

          {filtered && (
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                setSearch("");
                setAiOnly(false);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {recordsQuery.isPending ? (
        <ListSkeleton />
      ) : records.length === 0 ? (
        <EmptyState
          title={
            filtered
              ? "Nothing matches those filters"
              : `No ${lower(heading)} yet`
          }
          description={
            filtered
              ? "Widen the search, or clear the filters to see the whole book."
              : `When your ${lexicon.employee.many} book, move or cancel something on ${withArticle(lexicon.call.one)}, it lands here with the ${lower(lexicon.conversation.one)} that produced it.`
          }
          action={
            filtered ? (
              <Button
                onClick={() => {
                  setSearch("");
                  setAiOnly(false);
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-7">
          {groups.map((group) => (
            <section key={group.key}>
              <h2 className="mb-2 border-b border-line pb-1.5 font-mono text-2xs tracking-wide text-faint uppercase">
                {group.label}
                <span className="ml-2 normal-case">{group.records.length}</span>
              </h2>
              <ul className="space-y-px">
                {group.records.map((record) => (
                  <li key={record.id}>
                    <RecordRow
                      record={record}
                      party={
                        record.partyId
                          ? partiesById.get(record.partyId)
                          : undefined
                      }
                      resource={
                        record.resourceId
                          ? resourcesById.get(record.resourceId)
                          : undefined
                      }
                      location={locationsById.get(record.locationId)}
                      timezone={timezone}
                      selected={record.id === selectedId}
                      onSelect={() =>
                        setSelectedId((current) =>
                          current === record.id ? null : record.id,
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Below xl there is no side column, so the detail opens in flow. */}
      {detail && <div className="mt-8 xl:hidden">{detail}</div>}
    </Page>
  );
}

/**
 * Layout. Left-anchored against the navigation edge with a capped measure, and
 * the width earned above 1280px goes to the record under the cursor rather than
 * to margin.
 */
function Page({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside: React.ReactNode;
}) {
  return (
    <div className="px-5 py-8 sm:px-8 sm:py-12 xl:px-10">
      <div className="flex gap-10 2xl:gap-14">
        <div className="min-w-0 max-w-[46rem] flex-1">{children}</div>
        {aside ? (
          <aside className="hidden w-[21rem] shrink-0 xl:block">
            <div className="sticky top-8">{aside}</div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function Tabs({
  tabs,
  value,
  onChange,
  total,
  label,
}: {
  tabs: { archetype: RecordArchetype; count: number }[];
  value: Tab;
  onChange: (next: Tab) => void;
  total: number;
  label: ReturnType<typeof useLexicon>;
}) {
  // One archetype in the whole workspace makes a tab strip a decoration.
  if (tabs.length < 2) return null;

  const entries: { key: Tab; text: string; count: number }[] = [
    ...tabs.map((t) => ({
      key: t.archetype as Tab,
      text: label[t.archetype].many,
      count: t.count,
    })),
    { key: "all", text: "All", count: total },
  ];

  return (
    <div
      role="tablist"
      aria-label="Record type"
      className="-mx-1 flex flex-wrap items-center gap-1 overflow-x-auto px-1"
    >
      {entries.map((entry) => {
        const active = entry.key === value;
        return (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(entry.key)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control px-2.5",
              "text-sm font-medium whitespace-nowrap transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              active
                ? "bg-accent-surface text-ink"
                : "text-muted hover:bg-subtle hover:text-ink",
            )}
          >
            {entry.text}
            <span
              className={cn(
                "font-mono text-2xs tabular",
                active ? "text-muted" : "text-faint",
              )}
            >
              {entry.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Whose booking this is — the name it was taken under, not whoever the
 * directory currently calls that phone number.
 *
 * The two are usually the same person and usually agree. Where they do not,
 * the record wins: a second caller ringing from a shared phone renames the
 * party, and a receptionist correcting a misheard name renames it again, and
 * neither of those is an instruction to reassign a booking that was already
 * made. Falls back to the directory only where the record carried no name of
 * its own, which is every Northgate fixture.
 */
function recordName(
  record: DomainRecord,
  party: Party | undefined,
  partyTerm: string,
): string {
  return (
    record.partyName ??
    party?.displayName ??
    `Unidentified ${lower(partyTerm)}`
  );
}

function RecordRow({
  record,
  party,
  resource,
  location,
  timezone,
  selected,
  onSelect,
}: {
  record: DomainRecord;
  party: Party | undefined;
  resource: Resource | undefined;
  location: Location | undefined;
  timezone: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const lexicon = useLexicon();
  const byAi = record.createdByConversationId !== null;

  const meta = [
    recordTypeLabel(record.typeId),
    resource?.name,
    location?.code,
  ].filter(Boolean) as string[];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      // A row press is a selection, not a commitment — say so to the tactile
      // layer, which would otherwise classify a bare button as a plain tap.
      data-tactile="select"
      className={cn(
        "flex w-full items-start gap-3 rounded-panel px-3 py-2.5 text-left",
        "transition-colors",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
        selected ? "bg-accent-surface" : "hover:bg-subtle",
      )}
    >
      <span className="w-11 shrink-0 pt-0.5 font-mono text-xs text-muted tabular">
        {record.scheduledAt ? (
          clockTime(record.scheduledAt, timezone)
        ) : (
          <>
            <span aria-hidden>—</span>
            <span className="sr-only">No time set</span>
          </>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-ink">
            {recordName(record, party, lexicon.party.one)}
          </span>
          <RecordStatus status={record.status} />
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted">
          {meta.join(" · ")}
        </span>
      </span>

      {byAi && (
        // The reserved AI hue, used for the one thing it is reserved for:
        // marking that an AI employee, not a person, did this.
        <span className="shrink-0 pt-0.5 text-ai">
          <Bot className="size-3.5" aria-hidden />
          <span className="sr-only">
            Created on {withArticle(lexicon.call.one)}
          </span>
        </span>
      )}
    </button>
  );
}

function RecordDetail({
  record,
  party,
  resource,
  location,
  timezone,
}: {
  record: DomainRecord;
  party: Party | undefined;
  resource: Resource | undefined;
  location: Location | undefined;
  timezone: string;
}) {
  const lexicon = useLexicon();

  const rows: { label: string; value: string }[] = [
    {
      label: "When",
      value: record.scheduledAt
        ? dayAndTime(record.scheduledAt, timezone)
        : "Not scheduled",
    },
    {
      label: lexicon.resource.one,
      value: resource ? `${resource.name} · ${resource.kind}` : "Not assigned",
    },
    { label: lexicon.location.one, value: location?.name ?? "—" },
    ...Object.entries(record.fields).map(([key, value]) => ({
      label: humanize(key),
      value: formatFieldValue(value),
    })),
  ];

  return (
    <div className="overflow-hidden rounded-panel border border-line bg-elevated">
      <div className="border-b border-line px-3.5 py-3">
        <p className="font-mono text-2xs tracking-wide text-faint uppercase">
          {recordTypeLabel(record.typeId)}
        </p>
        <h2 className="mt-1 font-display text-lg text-ink">
          {recordName(record, party, lexicon.party.one)}
        </h2>
        <div className="mt-1.5">
          <RecordStatusInline status={record.status} />
        </div>
      </div>

      <dl className="divide-y divide-line">
        {rows.map((row) => (
          <div key={row.label} className="flex gap-3 px-3.5 py-2">
            <dt className="w-24 shrink-0 text-xs text-faint">{row.label}</dt>
            <dd className="min-w-0 flex-1 text-xs text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>

      <Provenance record={record} />
    </div>
  );
}

/**
 * Where this record came from — the question the whole surface exists to
 * answer.
 *
 * The call is fetched rather than assumed, because a record outlives the
 * conversation window it was made in: retention is a policy someone sets, not
 * an accident, and a link that 404s once a call ages out would teach people to
 * stop trusting the ones that work. So a resolved call gets a real link and its
 * own words, and an aged-out one says so plainly instead.
 */
function Provenance({ record }: { record: DomainRecord }) {
  const lexicon = useLexicon();
  const conversationId = record.createdByConversationId;

  const conversationQuery = useQuery({
    queryKey: qk.conversation(conversationId ?? ""),
    queryFn: () => service.getConversation(conversationId!),
    enabled: conversationId !== null,
  });

  if (!conversationId) {
    return (
      <div className="border-t border-line bg-subtle px-3.5 py-3">
        <p className="text-xs font-medium text-ink">
          Not created on {withArticle(lexicon.call.one)}
        </p>
        <p className="mt-1 text-xs text-muted">
          Imported from the system you already had. Added{" "}
          {relativeAgo(record.createdAt)}.
        </p>
      </div>
    );
  }

  const conversation = conversationQuery.data;

  return (
    <div className="border-t border-line bg-subtle px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-ai">
        <Bot className="size-3.5 shrink-0" aria-hidden />
        Created on {withArticle(lexicon.call.one)}
      </p>
      <p className="mt-1 text-xs text-muted">
        Raised {relativeAgo(record.createdAt)}
        {conversation?.intent ? ` — ${lower(conversation.intent)}` : ""}.
      </p>

      {conversationQuery.isPending ? null : conversation ? (
        <Link
          href={`/conversations/${conversation.id}`}
          className="mt-2 inline-block text-xs font-medium text-ink underline underline-offset-4 hover:text-muted"
        >
          Open the {lower(lexicon.conversation.one)}
        </Link>
      ) : (
        <p className="mt-2 text-xs text-faint">
          That {lower(lexicon.call.one)} is past your retention window, so the
          transcript is no longer stored.
        </p>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-7" aria-busy>
      <span role="status" aria-live="polite" className="sr-only">
        Loading records
      </span>
      {[0, 1].map((group) => (
        <section key={group}>
          <Skeleton className="mb-3 h-2.5 w-28" />
          <div className="space-y-2">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-start gap-3 px-3">
                <Skeleton className="h-3 w-9" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-44" />
                  <Skeleton className="h-2.5 w-60" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shaping
// ─────────────────────────────────────────────────────────────────────────────

type DayGroup = { key: string; label: string; records: DomainRecord[] };

/**
 * Day book order: today and everything ahead of it, ascending, then the days
 * behind it most-recent-first, then anything with no time at all.
 *
 * Upcoming leads because this screen is read forwards — the question at a front
 * desk is "who is coming", and yesterday is reference material. The service has
 * already sorted within a day, so this only buckets.
 */
function groupByDay(records: DomainRecord[], timezone: string): DayGroup[] {
  const todayKey = dayKey(new Date(now()).toISOString(), timezone);
  const tomorrowKey = dayKey(
    new Date(now() + 24 * 60 * 60 * 1000).toISOString(),
    timezone,
  );

  const byDay = new Map<string, DomainRecord[]>();
  const undated: DomainRecord[] = [];

  for (const record of records) {
    if (!record.scheduledAt) {
      undated.push(record);
      continue;
    }
    const key = dayKey(record.scheduledAt, timezone);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(record);
    else byDay.set(key, [record]);
  }

  const toGroup = (key: string): DayGroup => {
    const dayRecords = byDay.get(key) ?? [];
    const label =
      key === todayKey
        ? "Today"
        : key === tomorrowKey
          ? "Tomorrow"
          : dayHeading(dayRecords[0]!.scheduledAt!, timezone);
    return { key, label, records: dayRecords };
  };

  const keys = [...byDay.keys()];
  const upcoming = keys.filter((k) => k >= todayKey).sort();
  const past = keys.filter((k) => k < todayKey).sort().reverse();

  const groups = [...upcoming.map(toGroup), ...past.map(toGroup)];

  if (undated.length > 0) {
    groups.push({ key: "undated", label: "No date", records: undated });
  }

  return groups;
}

function formatFieldValue(
  value: string | number | boolean | null,
): string {
  if (value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/** id → entity, for turning the ids on a record into names. */
function useIndex<T extends { id: string }>(items: T[] | undefined) {
  return useMemo(
    () => new Map((items ?? []).map((item) => [item.id, item])),
    [items],
  );
}
