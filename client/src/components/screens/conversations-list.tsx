"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Phone, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import { useScope } from "@/lib/store/scope";
import { useDomainPack, useLexicon } from "@/components/providers/app-providers";
import { resolveNavLabel } from "@/lib/domains/registry";
import { isLiveStatus } from "@/lib/domain/types";
import { Input } from "@/components/primitives/input";
import { StatusPill } from "@/components/primitives/status";
import { EmptyState, ErrorState } from "@/components/primitives/empty-state";
import { Skeleton } from "@/components/primitives/skeleton";
import { ControlGlyph } from "@/components/domain/control-indicator";
import { BLOCKER_SHORT, OUTCOME_LABEL, OUTCOME_TONE } from "@/lib/domain/labels";
import { dayAndTime, duration } from "@/lib/utils/time";
import { lower } from "@/lib/lexicon";
import type { Conversation, ConversationOutcome } from "@/lib/domain/types";

/** Every outcome except "in progress" — that one is read off the live glyph instead. */
const OUTCOME_FILTERS: ConversationOutcome[] = ["resolved", "escalated", "abandoned", "failed"];

/**
 * Every conversation an AI employee has had, most recent first.
 *
 * Live calls surface their control state (who is driving, right now); ended
 * ones surface their outcome. The two never share a badge, because "in
 * progress" and "resolved" answer different questions and conflating them
 * would make the list unreadable at a glance.
 */
export function ConversationsList() {
  const scope = useScope();
  const lexicon = useLexicon();
  const domainPack = useDomainPack();
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState<ConversationOutcome | null>(null);

  const filters = useMemo(() => ({ scope, outcome: outcome ? [outcome] : undefined }), [scope, outcome]);

  const query = useQuery({
    queryKey: qk.conversations(filters),
    queryFn: () => service.listConversations(filters),
    // Faster while a call is in progress: a row that says "live now" should
    // not be a minute stale, and the list is where a supervisor notices one.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((c) => isLiveStatus(c.status)) ? 5_000 : 30_000,
  });

  const title = resolveNavLabel("conversations", lexicon.conversation.many, domainPack);

  const visible = useMemo(() => {
    const list = query.data ?? [];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (c) =>
        c.fromLabel.toLowerCase().includes(q) ||
        c.intent?.toLowerCase().includes(q) ||
        c.summary?.toLowerCase().includes(q),
    );
  }, [query.data, search]);

  const liveCount = (query.data ?? []).filter((c) => isLiveStatus(c.status)).length;

  return (
    <div className="px-5 py-8 sm:px-8 sm:py-12 xl:px-10">
      <div className="max-w-4xl">
        <header className="mb-6">
          <h1 className="font-display text-3xl text-ink">{title}</h1>
          <p className="mt-1.5 text-md text-muted">
            {liveCount > 0
              ? `${liveCount} live now · every ${lower(lexicon.call.one)} your AI employees have handled`
              : `Every ${lower(lexicon.call.one)} your AI employees have handled`}
          </p>
        </header>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-faint" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by caller or summary"
              className="h-9 pl-8 text-sm"
              aria-label="Search conversations"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={outcome === null} onClick={() => setOutcome(null)}>
              All
            </FilterChip>
            {OUTCOME_FILTERS.map((o) => (
              <FilterChip key={o} active={outcome === o} onClick={() => setOutcome(o === outcome ? null : o)}>
                {OUTCOME_LABEL[o]}
              </FilterChip>
            ))}
          </div>
        </div>

        {query.isError ? (
          <ErrorState
            title="Could not load conversations"
            detail="The conversations service did not respond. Try again in a moment."
            onRetry={() => query.refetch()}
          />
        ) : query.isLoading ? (
          <div className="divide-y divide-line border-y border-line">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-1 py-3.5">
                <Skeleton className="size-5 shrink-0 rounded-full" />
                <Skeleton className="h-3.5 flex-1" />
                <Skeleton className="h-3.5 w-12" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            title={search || outcome ? "No conversations match" : "No conversations yet"}
            description={
              search || outcome
                ? "Try a different search term or clear the filter."
                : `Once your AI employee takes a ${lower(lexicon.call.one)}, it will show up here with the full transcript.`
            }
          />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {visible.map((conversation) => (
              <ConversationRow key={conversation.id} conversation={conversation} />
            ))}
          </ul>
        )}
      </div>
    </div>
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
        "rounded-full border px-2.5 py-1 text-2xs font-medium tracking-wide whitespace-nowrap",
        "transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        active
          ? "border-ink bg-ink text-app"
          : "border-line-strong text-muted hover:bg-subtle",
      )}
    >
      {children}
    </button>
  );
}

function ConversationRow({ conversation }: { conversation: Conversation }) {
  const isLive = conversation.status === "active";
  const label = conversation.intent ?? conversation.summary;

  return (
    <li>
      <Link
        href={`/conversations/${conversation.id}`}
        className={cn(
          "flex items-start gap-3 px-1 py-3.5",
          "transition-colors hover:bg-subtle",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
        )}
      >
        <ControlGlyph
          control={conversation.control}
          activity={conversation.activity}
          live={isLive}
          className="mt-0.5"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-medium text-ink">
              {label ?? "Conversation"}
            </span>
            <span className="shrink-0 font-mono text-2xs text-faint tabular">
              {duration(conversation.effort.durationSeconds)}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1">
              <Phone className="size-3 shrink-0" aria-hidden />
              <span className="font-mono">{conversation.fromLabel}</span>
            </span>
            <span>{dayAndTime(conversation.startedAt)}</span>
            {!isLive && (
              <StatusPill tone={OUTCOME_TONE[conversation.outcome]}>
                {OUTCOME_LABEL[conversation.outcome]}
              </StatusPill>
            )}
          </div>

          {conversation.blocker && (
            <p className="mt-1 text-2xs font-medium text-warning">
              {BLOCKER_SHORT[conversation.blocker]}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
