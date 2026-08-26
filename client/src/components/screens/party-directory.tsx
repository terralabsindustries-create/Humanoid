"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  MessagesSquare,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import { useScope } from "@/lib/store/scope";
import {
  useDomainPack,
  useLexicon,
  useWorkspace,
} from "@/components/providers/app-providers";
import { resolveNavLabel } from "@/lib/domains/registry";
import { Button } from "@/components/primitives/button";
import { Input } from "@/components/primitives/input";
import { Badge, Status, StatusPill } from "@/components/primitives/status";
import { EmptyState, ErrorState } from "@/components/primitives/empty-state";
import { LoadingAnnouncement, Skeleton } from "@/components/primitives/skeleton";
import {
  CONSENT_LABEL,
  CONSENT_TONE,
  FACT_SOURCE_LABEL,
  FACT_SOURCE_TONE,
  OUTCOME_LABEL,
  OUTCOME_TONE,
} from "@/lib/domain/labels";
import { dayAndTime, longDate, relative, relativeLong } from "@/lib/utils/time";
import { count, lower, type Lexicon } from "@/lib/lexicon";
import type {
  ConsentState,
  Conversation,
  DomainRecord,
  Party,
  PartyFact,
} from "@/lib/domain/types";

/**
 * The customer directory — Patients, Guests, Clients, whatever this workspace
 * calls them.
 *
 * The job is not "browse a CRM". It is to answer one question about a person
 * the AI has been speaking to on your behalf: *what does it think it knows,
 * and did anybody check?* So the record is organised by provenance rather
 * than by field — what a person verified, what a system imported, and what
 * the AI worked out on its own and nobody has confirmed — and the only
 * actions here are confirming or correcting the last of those.
 *
 * A directory is the one surface where width above the reading measure has an
 * obvious job, so it is master-detail rather than a centred column: the list
 * keeps its place while the record beside it changes.
 */
export function PartyDirectory() {
  const router = useRouter();
  const params = useSearchParams();
  const scope = useScope();
  const lexicon = useLexicon();
  const domainPack = useDomainPack();
  const { loading: workspaceLoading } = useWorkspace();

  const [search, setSearch] = useState("");
  const [unconfirmedOnly, setUnconfirmedOnly] = useState(false);

  const selectedId = params.get("id");
  const title = resolveNavLabel("customers", lexicon.party.many, domainPack);

  const filters = {
    scope,
    search: search.trim() || undefined,
    unconfirmedOnly: unconfirmedOnly || undefined,
  };

  const partiesQuery = useQuery({
    queryKey: qk.parties(filters),
    queryFn: () => service.listParties(filters),
    // Typing must not blank the list under the cursor.
    placeholderData: keepPreviousData,
  });

  /** Selection lives in the URL so a record can be pasted into a message. */
  function select(id: string | null) {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("id", id);
    else next.delete("id");
    const query = next.toString();
    // `replace`: moving down a list is browsing, not navigation, and forty
    // back-presses to leave the screen is how history stops being useful.
    router.replace(query ? `/customers?${query}` : "/customers", {
      scroll: false,
    });
  }

  const parties = partiesQuery.data ?? [];

  return (
    <div className="flex h-full min-h-0">
      <section
        aria-label={title}
        className={cn(
          "flex min-h-0 w-full flex-col border-line lg:w-[21rem] lg:shrink-0 lg:border-r xl:w-[23rem]",
          // One pane at a time on a phone: a 320px list beside a record is
          // two unusable columns rather than one usable one.
          selectedId && "hidden lg:flex",
        )}
      >
        <header className="px-5 pt-8 pb-4 sm:px-6">
          <h1 className="font-display text-2xl text-ink">{title}</h1>
          <p className="mt-1 text-sm text-muted">
            {partiesQuery.isPending
              ? "Loading…"
              : summarise(parties, lexicon, unconfirmedOnly)}
          </p>

          <div className="relative mt-4">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-faint"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={`Search ${lower(title)}`}
              placeholder="Name, number or a noted fact"
              className="h-9 pl-8 text-sm"
            />
          </div>

          <div className="mt-2.5 flex gap-1">
            <FilterChip
              active={!unconfirmedOnly}
              onClick={() => setUnconfirmedOnly(false)}
            >
              Everyone
            </FilterChip>
            <FilterChip
              active={unconfirmedOnly}
              onClick={() => setUnconfirmedOnly(true)}
            >
              Needs confirming
            </FilterChip>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-8">
          {partiesQuery.isError ? (
            <ErrorState
              className="px-3"
              title={`Could not load ${lower(title)}`}
              detail="The directory did not respond. Live calls are unaffected."
              onRetry={() => partiesQuery.refetch()}
            />
          ) : partiesQuery.isPending ? (
            <ListSkeleton label={`Loading ${lower(title)}`} />
          ) : parties.length === 0 ? (
            <EmptyState
              className="px-3"
              tone="quiet"
              title={
                search || unconfirmedOnly
                  ? "Nothing matches"
                  : `No ${lower(lexicon.party.many)} yet`
              }
              description={
                search || unconfirmedOnly
                  ? "Clear the search or the filter to see the whole directory."
                  : `The first person your ${lower(lexicon.employee.one)} speaks to gets a record here, built from what it hears and what your systems already hold.`
              }
            />
          ) : (
            <ul>
              {parties.map((party) => (
                <li key={party.id}>
                  <PartyRow
                    party={party}
                    selected={party.id === selectedId}
                    onSelect={() => select(party.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section
        aria-label={lexicon.party.one}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          !selectedId && "hidden lg:block",
        )}
      >
        {selectedId ? (
          <PartyRecord
            partyId={selectedId}
            onBack={() => select(null)}
            key={selectedId}
          />
        ) : (
          <div className="px-6 pt-8 sm:px-8">
            {!workspaceLoading && parties.length > 0 && (
              <EmptyState
                tone="quiet"
                title="Choose someone to see their record"
                description={`Every ${lower(lexicon.party.one)} record separates what a person verified from what the AI worked out on its own, so you can confirm the second kind or correct it.`}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function summarise(
  parties: Party[],
  lexicon: Lexicon,
  filtered: boolean,
): string {
  if (parties.length === 0) return "Nothing to show";
  const unconfirmed = parties.filter(
    (party) => unconfirmedFacts(party).length > 0,
  ).length;

  const total = count(parties.length, lexicon.party);
  if (filtered) return `${total} with something to confirm`;
  if (unconfirmed === 0) return `${total} · everything confirmed`;
  return `${total} · ${unconfirmed} with something to confirm`;
}

function unconfirmedFacts(party: Party): PartyFact[] {
  return party.facts.filter(
    (fact) => fact.source === "ai_inferred" || fact.source === "unverified",
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-control px-2.5 py-1 text-xs font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        active
          ? "bg-accent-surface text-ink"
          : "text-muted hover:bg-subtle hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function PartyRow({
  party,
  selected,
  onSelect,
}: {
  party: Party;
  selected: boolean;
  onSelect: () => void;
}) {
  const unconfirmed = unconfirmedFacts(party);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "w-full rounded-panel px-3 py-2.5 text-left transition-colors",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
        selected ? "bg-subtle" : "hover:bg-subtle",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium text-ink">
          {party.displayName}
        </span>
        {party.lastContactAt && (
          <span
            className="shrink-0 font-mono text-2xs text-faint tabular"
            title={relativeLong(party.lastContactAt)}
          >
            {relative(party.lastContactAt)}
          </span>
        )}
      </div>

      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs text-muted">
          {contactLine(party)}
        </span>
        {unconfirmed.length > 0 && (
          // A count, not a state: these facts are a mix of AI-noted and
          // merely unverified, and a row tinted with either hue would
          // overstate one of them. The record itself carries the real tones.
          <Badge className="shrink-0">{unconfirmed.length} to confirm</Badge>
        )}
      </div>
    </button>
  );
}

/**
 * The line under the name.
 *
 * Somebody nobody has named yet *is* their number — that is what sits in the
 * title — so repeating it here would fill the row with one string twice.
 * Saying why the title is a number is more use than saying it again.
 */
function contactLine(party: Party): string {
  const contact = party.phone ?? party.email;
  if (!contact) return "No contact details";
  return contact === party.displayName ? "Name not given" : contact;
}

function ListSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy>
      <LoadingAnnouncement label={label} />
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="px-3 py-3">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="mt-2 h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

/**
 * The record.
 *
 * Read top to bottom it answers: who is this, what do we believe about them
 * and on whose authority, what did they agree to, and what has actually
 * happened between them and the business.
 */
function PartyRecord({
  partyId,
  onBack,
}: {
  partyId: string;
  onBack: () => void;
}) {
  const lexicon = useLexicon();
  const { locations } = useWorkspace();

  const partyQuery = useQuery({
    queryKey: qk.party(partyId),
    queryFn: () => service.getParty(partyId),
  });

  const conversationsQuery = useQuery({
    queryKey: qk.conversations({ partyId }),
    queryFn: () => service.listConversations({ partyId }),
  });

  const recordsQuery = useQuery({
    queryKey: qk.records({ partyId }),
    queryFn: () => service.listRecords({ partyId }),
  });

  if (partyQuery.isError) {
    return (
      <div className="px-6 pt-8 sm:px-8">
        <ErrorState
          title="Could not load this record"
          detail="The directory did not respond. Nothing has been changed."
          onRetry={() => partyQuery.refetch()}
        />
      </div>
    );
  }

  if (partyQuery.isPending) {
    return (
      <div className="px-6 pt-8 sm:px-8" aria-busy>
        <LoadingAnnouncement label="Loading record" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-3 h-3.5 w-72" />
        <Skeleton className="mt-8 h-24 w-full max-w-2xl" />
      </div>
    );
  }

  const party = partyQuery.data;

  if (!party) {
    return (
      <div className="px-6 pt-8 sm:px-8">
        <EmptyState
          title="No such record"
          description={`This ${lower(lexicon.party.one)} may have been merged into another record or removed under a retention policy. The audit log records either.`}
          action={
            <Button onClick={onBack}>Back to {lower(lexicon.party.many)}</Button>
          }
        />
      </div>
    );
  }

  const home = locations.find((l) => l.id === party.homeLocationId);
  const unconfirmed = unconfirmedFacts(party);
  const settled = party.facts.filter(
    (fact) => fact.source === "verified" || fact.source === "imported",
  );

  return (
    <div className="px-5 pt-8 pb-16 sm:px-8">
      <button
        type="button"
        onClick={onBack}
        className={cn(
          "mb-4 -ml-1 inline-flex items-center gap-1.5 rounded-control px-1 py-0.5",
          "text-xs font-medium text-muted transition-colors hover:text-ink lg:hidden",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        )}
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All {lower(lexicon.party.many)}
      </button>

      <div className="max-w-2xl">
        <header>
          <h2 className="font-display text-3xl text-ink">
            {party.displayName}
          </h2>
          <dl className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-sm">
            {party.phone && (
              <div className="flex items-baseline gap-2">
                <dt className="sr-only">Phone</dt>
                <dd className="font-mono text-muted">{party.phone}</dd>
              </div>
            )}
            {party.email && (
              <div className="flex items-baseline gap-2">
                <dt className="sr-only">Email</dt>
                <dd className="text-muted">{party.email}</dd>
              </div>
            )}
            {home && (
              <div className="flex items-baseline gap-2">
                <dt className="text-faint">{lexicon.location.one}</dt>
                <dd className="text-muted">{home.name}</dd>
              </div>
            )}
            <div className="flex items-baseline gap-2">
              <dt className="text-faint">Speaks</dt>
              <dd className="text-muted">{languageName(party.preferredLanguage)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-faint">
            Known since {longDate(party.createdAt)}
            {party.lastContactAt
              ? ` · last spoke ${relativeLong(party.lastContactAt)}`
              : " · has not called yet"}
          </p>
        </header>

        <Band
          label="Not confirmed"
          description={
            unconfirmed.length > 0
              ? "The AI worked these out from what it heard. Nobody has checked them, so they are not used to identify anyone."
              : undefined
          }
        >
          {unconfirmed.length === 0 ? (
            <p className="text-sm text-muted">
              {party.facts.length === 0
                ? // "Everything is confirmed" would be a strange thing to say
                  // about a record holding nothing, and it contradicts the
                  // band below it saying nothing has been verified.
                  `Nothing to check yet. The AI has not noted anything about this ${lower(lexicon.party.one)} beyond how to reach them.`
                : "Everything on this record has been confirmed by a person or came from a connected system."}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {unconfirmed.map((fact) => (
                <li key={fact.label}>
                  <FactRow party={party} fact={fact} actionable />
                </li>
              ))}
            </ul>
          )}
        </Band>

        <Band label="On record">
          {settled.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing about this {lower(lexicon.party.one)} has been verified
              yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {settled.map((fact) => (
                <li key={fact.label}>
                  <FactRow party={party} fact={fact} />
                </li>
              ))}
            </ul>
          )}
        </Band>

        <Band label="Consent">
          <div className="space-y-3">
            <ConsentLine
              label="Call recording"
              state={party.consent.recording}
              detail={RECORDING_DETAIL[party.consent.recording]}
            />
            <ConsentLine
              label="Marketing contact"
              state={party.consent.marketing}
              detail={MARKETING_DETAIL[party.consent.marketing]}
            />
          </div>
          {party.consent.updatedAt && (
            <p className="mt-3 text-xs text-faint">
              Last answered {relativeLong(party.consent.updatedAt)}.
            </p>
          )}
        </Band>

        <Band
          label="History"
          action={
            <Link
              href="/conversations"
              className="text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              All {lower(lexicon.conversation.many)}
            </Link>
          }
        >
          <History
            conversations={conversationsQuery.data ?? []}
            records={recordsQuery.data ?? []}
            displayName={party.displayName}
            loading={conversationsQuery.isPending || recordsQuery.isPending}
          />
        </Band>
      </div>
    </div>
  );
}

const RECORDING_DETAIL: Record<ConsentState, string> = {
  granted: "Calls are recorded, and every playback is itself logged.",
  declined:
    "Calls are not recorded. Playback is blocked for everyone, including administrators.",
  unknown:
    "No answer on record. The AI asks at the start of the next call before anything is recorded.",
};

const MARKETING_DETAIL: Record<ConsentState, string> = {
  granted: "May be contacted about services and offers.",
  declined: "Must not be contacted about services or offers.",
  unknown: "Never asked. Treated as declined until it is.",
};

function ConsentLine({
  label,
  state,
  detail,
}: {
  label: string;
  state: ConsentState;
  detail: string;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2.5">
        <span className="text-sm font-medium text-ink">{label}</span>
        <Status tone={CONSENT_TONE[state]}>{CONSENT_LABEL[state]}</Status>
      </div>
      <p className="mt-0.5 text-xs text-muted">{detail}</p>
    </div>
  );
}

function Band({
  label,
  description,
  action,
  children,
}: {
  label: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-9 border-t border-line pt-5">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h3 className="font-mono text-2xs tracking-wide text-faint uppercase">
          {label}
        </h3>
        {action}
      </div>
      {description && (
        <p className="mb-3 max-w-prose text-sm text-muted">{description}</p>
      )}
      {children}
    </section>
  );
}

/**
 * A single fact, and the screen's whole point.
 *
 * Confirming is not cosmetic: it is the only route from "the AI thinks so" to
 * "we know", so the provenance pill and the button that changes it live in the
 * same row. Correcting is available on every fact, including imported ones —
 * a wrong date of birth from an old system is exactly the thing a caller
 * corrects on the phone.
 */
/**
 * Each card is tinted by its own provenance rather than by which group it
 * sits in. "The AI worked this out" and "somebody said so and nobody checked"
 * are different problems, and the AI hue belongs only to the first.
 */
const FACT_SURFACE: Record<PartyFact["source"], string> = {
  ai_inferred: "bg-ai-surface",
  unverified: "bg-warning-surface",
  verified: "bg-subtle/60",
  imported: "bg-subtle/60",
};

function FactRow({
  party,
  fact,
  actionable = false,
}: {
  party: Party;
  fact: PartyFact;
  actionable?: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fact.value);

  const onSaved = (updated: Party) => {
    queryClient.setQueryData(qk.party(updated.id), updated);
    // The list carries a "to confirm" count, so it has to move too.
    queryClient.invalidateQueries({ queryKey: ["parties"] });
    setEditing(false);
  };

  const confirmFact = useMutation({
    mutationFn: () =>
      service.confirmPartyFact({ partyId: party.id, label: fact.label }),
    onSuccess: onSaved,
  });

  const correctFact = useMutation({
    mutationFn: (value: string) =>
      service.correctPartyFact({
        partyId: party.id,
        label: fact.label,
        value,
      }),
    onSuccess: onSaved,
  });

  const busy = confirmFact.isPending || correctFact.isPending;
  const failed = confirmFact.isError || correctFact.isError;

  return (
    <div className={cn("rounded-panel px-3 py-2.5", FACT_SURFACE[fact.source])}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-ink">{fact.label}</span>
        <StatusPill tone={FACT_SOURCE_TONE[fact.source]}>
          {FACT_SOURCE_LABEL[fact.source]}
        </StatusPill>
      </div>

      {editing ? (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = draft.trim();
            if (value) correctFact.mutate(value);
          }}
        >
          <Input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label={`Correct ${fact.label}`}
            className="h-8 min-w-0 flex-1 text-sm"
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={correctFact.isPending}
            disabled={!draft.trim() || draft.trim() === fact.value}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="quiet"
            icon={<X className="size-3.5" aria-hidden />}
            onClick={() => {
              setDraft(fact.value);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <p className="mt-0.5 text-sm text-muted">{fact.value}</p>
      )}

      {!editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {actionable && (
            <Button
              variant="primary"
              size="sm"
              loading={confirmFact.isPending}
              disabled={busy}
              icon={<Check className="size-3.5" aria-hidden />}
              onClick={() => confirmFact.mutate()}
            >
              Confirm
            </Button>
          )}
          <Button
            variant={actionable ? "secondary" : "quiet"}
            size="sm"
            disabled={busy}
            icon={<Pencil className="size-3.5" aria-hidden />}
            onClick={() => setEditing(true)}
          >
            Correct
          </Button>
          <span className="text-2xs text-faint">
            Updated {relativeLong(fact.updatedAt)}
          </span>
        </div>
      )}

      {failed && (
        <p role="alert" className="mt-2 text-xs font-medium text-danger">
          That change was not saved. The record is unchanged — try again.
        </p>
      )}
    </div>
  );
}

/**
 * What has actually happened, calls and records interleaved. Conversations
 * are not links yet: the timeline surface they would open does not exist, and
 * a link to nowhere is worse than a line of text that tells the truth.
 */
function History({
  conversations,
  records,
  displayName,
  loading,
}: {
  conversations: Conversation[];
  records: DomainRecord[];
  /** Who the directory currently says this is — see the note on the name line below. */
  displayName: string;
  loading: boolean;
}) {
  const lexicon = useLexicon();

  if (loading) {
    return <Skeleton className="h-16 w-full" />;
  }

  const events = [
    ...conversations.map((conversation) => ({
      id: conversation.id,
      at: conversation.startedAt,
      title:
        conversation.intent ??
        `${lexicon.call.one} from ${conversation.fromLabel}`,
      detail: conversation.summary,
      pill: (
        <StatusPill tone={OUTCOME_TONE[conversation.outcome]}>
          {OUTCOME_LABEL[conversation.outcome]}
        </StatusPill>
      ),
    })),
    ...records.map((record) => ({
      id: record.id,
      at: record.createdAt,
      // The archetype is the only part of a record this screen knows how to
      // name. Its type and status are pack-supplied strings, so they are
      // shown as written rather than mapped through a table that would have
      // to know every industry's vocabulary.
      title: lexicon[record.archetype].one,
      // Ordered by when the record was raised, but a diary entry's own time is
      // the thing a person actually wants off this list, so it rides along in
      // the detail line rather than being dropped.
      detail: [
        String(record.fields.reason ?? record.fields.source ?? ""),
        record.scheduledAt ? `For ${dayAndTime(record.scheduledAt)}` : "",
        // One phone can belong to a household, and the name a booking was
        // taken under is the only evidence of that. Said only when the two
        // disagree — repeating the name at the top of the record on every
        // row would be noise.
        record.partyName && record.partyName !== displayName
          ? `Booked under ${record.partyName}`
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
      pill: <StatusPill tone="neutral">{sentenceCase(record.status)}</StatusPill>,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  if (events.length === 0) {
    return (
      <div className="flex items-start gap-2.5">
        <MessagesSquare className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
        <p className="text-sm text-muted">
          Nothing in the current window. Earlier{" "}
          {lower(lexicon.conversation.many)} are kept for as long as your
          retention policy says, and appear here when this surface reads them.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-px">
      {events.map((event) => (
        <li
          key={event.id}
          className="flex items-start justify-between gap-4 rounded-panel px-3 py-2.5 odd:bg-subtle/50"
        >
          <div className="min-w-0">
            <p className="text-sm text-ink">{event.title}</p>
            {event.detail && (
              // Clamped: a call summary can run to a paragraph, and one long
              // entry should not set the row height for the whole history.
              <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                {event.detail}
              </p>
            )}
            <p className="mt-1 font-mono text-2xs text-faint">
              {dayAndTime(event.at)}
            </p>
          </div>
          <div className="shrink-0">{event.pill}</div>
        </li>
      ))}
    </ol>
  );
}

function sentenceCase(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** BCP-47 → the language's own name, which is what a receptionist would say. */
function languageName(tag: string): string {
  try {
    const display = new Intl.DisplayNames(["en-GB"], { type: "language" });
    return display.of(tag) ?? tag;
  } catch {
    return tag;
  }
}
