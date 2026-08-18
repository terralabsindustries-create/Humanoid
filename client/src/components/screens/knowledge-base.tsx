"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  FileText,
  Globe,
  Lock,
  Mic,
  PencilLine,
  Plug,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import {
  useDomainPack,
  useLexicon,
  useWorkspace,
} from "@/components/providers/app-providers";
import { Button } from "@/components/primitives/button";
import { EmptyState, ErrorState } from "@/components/primitives/empty-state";
import { Input, Textarea } from "@/components/primitives/input";
import {
  LoadingAnnouncement,
  Skeleton,
} from "@/components/primitives/skeleton";
import { Status } from "@/components/primitives/status";
import {
  ANSWER_STATUS_LABEL,
  ANSWER_STATUS_TONE,
  SOURCE_KIND_LABEL,
  SOURCE_STATUS_LABEL,
  SOURCE_STATUS_TONE,
} from "@/lib/domain/labels";
import {
  answerCounts,
  authoredSource,
  employeesReadingFrom,
  itemsForSource,
  matchesAnswer,
  openDecisions,
  rankConflicts,
  rankGaps,
  sourceHealth,
  totalAsked,
} from "@/lib/domain/knowledge";
import { hasCapability } from "@/lib/navigation";
import { resolveNavLabel } from "@/lib/domains/registry";
import { lower } from "@/lib/lexicon";
import { relativeLong } from "@/lib/utils/time";
import type {
  AIEmployee,
  KnowledgeConflict,
  KnowledgeGap,
  KnowledgeItem,
  KnowledgeSource,
  KnowledgeSourceKind,
} from "@/lib/domain/types";

/**
 * Knowledge — what the AI is allowed to say.
 *
 * The organising decision is that this screen leads with *disagreement and
 * absence*, not with a library. A browsable list of answers is the obvious
 * shape and the wrong one: nobody comes here to admire coverage. They come
 * because a caller was told something wrong, or told nothing at all. Those are
 * two different failures with two different fixes, and each gets its own
 * section with its own action —
 *
 *   · two approved sources disagree → the AI answers *confidently* and wrongly
 *     (arch §12, risk 8). The fix is a decision: which source wins.
 *   · nothing covers the question → the AI declines, correctly, and the caller
 *     goes unserved. The fix is an answer somebody has to write.
 *
 * The library is still here, third, because "what does it actually say about
 * cancellations?" is a real question — but it is the reference view, not the
 * front door.
 *
 * What this screen refuses to do is imply that a decision made here has reached
 * a phone line. It has not: an answer written here is a draft, and drafts are
 * published through Releases with a diff and a rollback. Every write on this
 * screen says so at the point of the write rather than in a footnote, because
 * the gap between "I fixed it" and "customers stopped hearing it" is where
 * trust in a supervisory tool is actually lost.
 */

type View = "decisions" | "sources" | "answers";

const KIND_ICON: Record<KnowledgeSourceKind, typeof Globe> = {
  website: Globe,
  document: FileText,
  faq: PencilLine,
  manual: PencilLine,
  recording: Mic,
  integration: Plug,
};

export function KnowledgeBase() {
  const { user, loading: workspaceLoading } = useWorkspace();
  const [view, setView] = useState<View>("decisions");

  const capabilities = user?.capabilities ?? [];
  const mayEdit = hasCapability(capabilities, "knowledge.edit");

  /**
   * The gate decides whether the fetches happen at all, not just what is
   * painted. A refusal drawn over data already sitting in the query cache is a
   * curtain, not a permission check — and this is the surface where "what is
   * this AI allowed to say" lives, so it should not read what it will not show.
   * Waiting for the real user first keeps a hard reload from skipping the
   * fetches for everyone in the moment before `/me` lands.
   */
  const mayRead = !workspaceLoading && hasCapability(capabilities, "knowledge.read");

  const sourcesQuery = useQuery({
    queryKey: qk.knowledgeSources,
    queryFn: () => service.listKnowledgeSources(),
    enabled: mayRead,
  });
  const itemsQuery = useQuery({
    queryKey: qk.knowledgeItems(),
    queryFn: () => service.listKnowledgeItems(),
    enabled: mayRead,
  });
  const conflictsQuery = useQuery({
    queryKey: qk.knowledgeConflicts,
    queryFn: () => service.listKnowledgeConflicts(),
    enabled: mayRead,
  });
  const gapsQuery = useQuery({
    queryKey: qk.knowledgeGaps,
    queryFn: () => service.listKnowledgeGaps(),
    enabled: mayRead,
  });
  const employeesQuery = useQuery({
    queryKey: qk.employees,
    queryFn: () => service.listEmployees(),
    enabled: mayRead,
  });

  const sources = useMemo(() => sourcesQuery.data ?? [], [sourcesQuery.data]);
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const conflicts = useMemo(
    () => rankConflicts(conflictsQuery.data ?? []),
    [conflictsQuery.data],
  );
  const gaps = useMemo(() => rankGaps(gapsQuery.data ?? []), [gapsQuery.data]);

  const decisions = openDecisions(conflicts, gaps);
  const counts = answerCounts(items);

  // The capability check has to wait for the real user, or a hard reload paints
  // a refusal at every visitor for a moment before the fetch lands.
  if (!workspaceLoading && !hasCapability(capabilities, "knowledge.read")) {
    return (
      <Page rail={null}>
        <Header />
        <NoAccess />
      </Page>
    );
  }

  const failed =
    sourcesQuery.isError ||
    itemsQuery.isError ||
    conflictsQuery.isError ||
    gapsQuery.isError;

  if (failed) {
    return (
      <Page rail={null}>
        <Header />
        <ErrorState
          title="Could not load the knowledge base"
          detail="The knowledge service did not respond. What the AI can answer is unaffected — this failure is limited to reading it here, and nothing has been changed."
          onRetry={() => {
            void sourcesQuery.refetch();
            void itemsQuery.refetch();
            void conflictsQuery.refetch();
            void gapsQuery.refetch();
          }}
        />
      </Page>
    );
  }

  const loading =
    sourcesQuery.isPending ||
    itemsQuery.isPending ||
    conflictsQuery.isPending ||
    gapsQuery.isPending;

  // A workspace with nothing imported has no decisions to make and no library
  // to browse. Three tabs over three empty lists is worse than one honest
  // answer about what this surface is for.
  const bare = !loading && sources.length === 0 && items.length === 0;

  return (
    <Page
      rail={
        loading || bare ? null : (
          <Rail sources={sources} counts={counts} gaps={gaps} />
        )
      }
    >
      <Header
        sources={sources}
        counts={counts}
        conflicts={conflicts}
        gaps={gaps}
        summarise={!loading}
      />

      {loading ? (
        <KnowledgeSkeleton />
      ) : bare ? (
        <EmptyState
          className="mt-8"
          title="Nothing imported yet"
          description="This is where what the AI may tell customers lives — a website it has read, documents you upload, answers written by hand. Until something is here it will decline every question of fact rather than guess at one, which is the right behaviour and a poor experience."
        />
      ) : (
        <>
          <div className="mt-7 flex flex-wrap items-center gap-1">
            <ViewTab
              label="Needs deciding"
              count={decisions}
              active={view === "decisions"}
              onClick={() => setView("decisions")}
            />
            <ViewTab
              label="Sources"
              count={sources.length}
              active={view === "sources"}
              onClick={() => setView("sources")}
            />
            <ViewTab
              label="Answers"
              count={items.length}
              active={view === "answers"}
              onClick={() => setView("answers")}
            />
          </div>

          <div className="mt-6">
            {view === "decisions" && (
              <Decisions
                conflicts={conflicts}
                gaps={gaps}
                sources={sources}
                items={items}
                mayEdit={mayEdit}
              />
            )}
            {view === "sources" && (
              <Sources
                sources={sources}
                items={items}
                employees={employeesQuery.data ?? []}
              />
            )}
            {view === "answers" && (
              <Answers items={items} sources={sources} />
            )}
          </div>
        </>
      )}
    </Page>
  );
}

/**
 * Left-anchored, like every other reading surface in the shell. The width above
 * 1280px goes to coverage — what is answerable, what is failing, how often a
 * caller hits nothing — which is the standing context for every decision on
 * this page rather than a repeat of it.
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

/**
 * `summarise` is off wherever the counts would be a claim rather than a fact —
 * a refusal or a failed fetch. "Nothing here yet" under a permission error
 * would tell a person their knowledge base is empty when what actually
 * happened is that nobody looked.
 */
function Header({
  sources = [],
  counts = { approved: 0, draft: 0, stale: 0 },
  conflicts = [],
  gaps = [],
  summarise = false,
}: {
  sources?: KnowledgeSource[];
  counts?: ReturnType<typeof answerCounts>;
  conflicts?: KnowledgeConflict[];
  gaps?: KnowledgeGap[];
  summarise?: boolean;
}) {
  const lexicon = useLexicon();
  const pack = useDomainPack();

  const unresolved = conflicts.filter((c) => c.status === "unresolved").length;
  const unanswered = gaps.filter((g) => g.draftItemId === null).length;

  return (
    <header>
      <p className="font-mono text-2xs tracking-wide text-faint uppercase">
        Shared by every {lower(lexicon.employee.one)}
      </p>
      <h1 className="mt-1.5 font-display text-3xl text-ink">
        {resolveNavLabel("knowledge", "Knowledge", pack)}
      </h1>

      {summarise && (
        <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">
          {counts.approved === 0 && sources.length === 0 ? (
            <>Nothing here yet.</>
          ) : (
            <>
              <span className="font-medium text-ink tabular">
                {counts.approved}
              </span>{" "}
              approved {counts.approved === 1 ? "answer" : "answers"} across{" "}
              <span className="font-medium text-ink tabular">
                {sources.length}
              </span>{" "}
              {sources.length === 1 ? "source" : "sources"}.
              {unresolved > 0 || unanswered > 0 ? (
                <>
                  {" "}
                  {unresolved > 0 && (
                    <>
                      <span className="font-medium text-ink tabular">
                        {unresolved}
                      </span>{" "}
                      {unresolved === 1 ? "topic has" : "topics have"} sources
                      that contradict each other
                      {unanswered > 0 ? ", and " : ". "}
                    </>
                  )}
                  {unanswered > 0 && (
                    <>
                      <span className="font-medium text-ink tabular">
                        {unanswered}
                      </span>{" "}
                      {unanswered === 1 ? "question keeps" : "questions keep"}{" "}
                      being asked that nothing here answers.{" "}
                    </>
                  )}
                  A contradiction is the more urgent of the two: it produces a
                  confident wrong answer, where a gap produces an honest
                  &ldquo;I can&rsquo;t confirm that&rdquo;.
                </>
              ) : (
                <> Nothing is contradicting itself and nothing is unanswered.</>
              )}
            </>
          )}
        </p>
      )}
    </header>
  );
}

function ViewTab({
  label,
  count: value,
  active,
  onClick,
}: {
  label: string;
  count: number;
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
      {label}
      <span
        className={cn(
          "font-mono text-2xs tabular",
          active ? "text-muted" : "text-faint",
        )}
      >
        {value}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Needs deciding
// ─────────────────────────────────────────────────────────────────────────────

function Decisions({
  conflicts,
  gaps,
  sources,
  items,
  mayEdit,
}: {
  conflicts: KnowledgeConflict[];
  gaps: KnowledgeGap[];
  sources: KnowledgeSource[];
  items: KnowledgeItem[];
  mayEdit: boolean;
}) {
  const lexicon = useLexicon();

  if (conflicts.length === 0 && gaps.length === 0) {
    return (
      <EmptyState
        title="Nothing to decide"
        description={`No two sources are contradicting each other, and every question ${lower(lexicon.party.many)} have asked has an answer behind it. Both lists fill themselves — a contradiction from a sync, a gap from a call the AI could not answer.`}
      />
    );
  }

  return (
    <div className="space-y-10">
      {conflicts.length > 0 && (
        <section>
          <SectionHeading
            title="Sources disagree"
            detail="Two approved sources make different claims about the same thing, so the answer a caller gets depends on which one the AI reads first. Choosing one does not delete the other — it decides which is answered from."
          />
          <div className="mt-4 space-y-3">
            {conflicts.map((conflict) => (
              <ConflictCard
                key={conflict.id}
                conflict={conflict}
                sources={sources}
                mayEdit={mayEdit}
              />
            ))}
          </div>
        </section>
      )}

      {gaps.length > 0 && (
        <section>
          <SectionHeading
            title="Nothing answers these"
            detail="Questions that arrived with no approved source behind them. The AI declined rather than guessing, which is correct and is still a caller who did not get what they rang for."
          />
          <div className="mt-4 space-y-3">
            {gaps.map((gap) => (
              <GapCard
                key={gap.id}
                gap={gap}
                items={items}
                sources={sources}
                mayEdit={mayEdit}
              />
            ))}
          </div>
        </section>
      )}

      <PublishNote />
    </div>
  );
}

function SectionHeading({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div>
      <h2 className="font-display text-xl text-ink">{title}</h2>
      <p className="mt-1.5 max-w-prose text-sm text-muted">{detail}</p>
    </div>
  );
}

function ConflictCard({
  conflict,
  sources,
  mayEdit,
}: {
  conflict: KnowledgeConflict;
  sources: KnowledgeSource[];
  mayEdit: boolean;
}) {
  const client = useQueryClient();
  const [changing, setChanging] = useState(false);

  const resolve = useMutation({
    mutationFn: (sourceId: string) =>
      service.resolveKnowledgeConflict({ conflictId: conflict.id, sourceId }),
    onSuccess: () => {
      setChanging(false);
      void client.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });

  const resolved = conflict.status === "resolved";
  const deciding = !resolved || changing;

  return (
    <article className="rounded-panel border border-line bg-elevated">
      <div className="border-b border-line px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <h3 className="min-w-0 text-md font-medium text-ink">
            {conflict.topic}
          </h3>
          {resolved ? (
            <Status tone="success" icon={<Check className="size-3" />}>
              Decided
            </Status>
          ) : (
            <Status tone="danger" icon={<AlertTriangle className="size-3" />}>
              Undecided
            </Status>
          )}
        </div>
        <p className="mt-1.5 font-mono text-2xs text-faint tabular">
          asked {conflict.askCount}{" "}
          {conflict.askCount === 1 ? "time" : "times"} · last{" "}
          {relativeLong(conflict.lastAskedAt)}
        </p>
      </div>

      <div className="divide-y divide-line">
        {conflict.claims.map((claim) => {
          const source = sources.find((s) => s.id === claim.sourceId) ?? null;
          const chosen = conflict.resolvedSourceId === claim.sourceId;
          const rejected = resolved && !chosen;

          return (
            <div
              key={claim.sourceId}
              className={cn(
                "px-4 py-3.5",
                chosen && "bg-success-surface",
                rejected && !changing && "opacity-60",
              )}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <SourceName source={source} fallbackId={claim.sourceId} />
                {chosen && (
                  <Status tone="success" icon={<Check className="size-3" />}>
                    Answered from
                  </Status>
                )}
                {rejected && !changing && (
                  <span className="font-mono text-2xs text-faint">
                    not used for this topic
                  </span>
                )}
              </div>

              <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink">
                {claim.claim}
              </p>

              {deciding && mayEdit && !chosen && (
                <Button
                  size="sm"
                  className="mt-3"
                  loading={
                    resolve.isPending && resolve.variables === claim.sourceId
                  }
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate(claim.sourceId)}
                >
                  Answer from this one
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-3">
        {!mayEdit ? (
          <p className="flex items-center gap-1.5 text-2xs text-faint">
            <Lock className="size-3" aria-hidden />
            Deciding this needs permission to approve answers.
          </p>
        ) : resolved && !changing ? (
          <>
            <p className="text-2xs text-faint">
              Recorded in the draft. It reaches callers when the draft is
              published.
            </p>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => setChanging(true)}
              className="ml-auto"
            >
              Change
            </Button>
          </>
        ) : changing ? (
          <Button size="sm" variant="quiet" onClick={() => setChanging(false)}>
            Keep the current choice
          </Button>
        ) : (
          <p className="text-2xs text-faint">
            Until this is decided the AI answers with whichever source it reads
            first.
          </p>
        )}

        {resolve.isError && (
          <p className="w-full text-2xs text-danger">
            That did not save. The conflict is unchanged — try again.
          </p>
        )}
      </div>
    </article>
  );
}

function GapCard({
  gap,
  items,
  sources,
  mayEdit,
}: {
  gap: KnowledgeGap;
  items: KnowledgeItem[];
  sources: KnowledgeSource[];
  mayEdit: boolean;
}) {
  const client = useQueryClient();
  const draft = gap.draftItemId
    ? (items.find((item) => item.id === gap.draftItemId) ?? null)
    : null;

  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");

  const target = authoredSource(sources);

  const answer = useMutation({
    mutationFn: (value: string) =>
      service.answerKnowledgeGap({ gapId: gap.id, answer: value }),
    onSuccess: () => {
      setWriting(false);
      setText("");
      void client.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });

  const open = () => {
    setText(draft?.answer ?? "");
    setWriting(true);
  };

  const trimmed = text.trim();

  return (
    <article className="rounded-panel border border-line bg-elevated">
      <div className="px-4 py-3.5">
        <h3 className="text-md font-medium text-ink">{gap.question}</h3>
        <p className="mt-1.5 font-mono text-2xs text-faint tabular">
          asked {gap.askCount} {gap.askCount === 1 ? "time" : "times"} · last{" "}
          {relativeLong(gap.lastAskedAt)}
        </p>

        <div className="mt-3 border-l-2 border-line pl-3">
          <p className="font-mono text-2xs tracking-wide text-faint uppercase">
            What happens instead
          </p>
          <p className="mt-1 max-w-prose text-sm text-muted">
            {gap.fallbackBehaviour}
          </p>
        </div>

        {gap.linkedIssueId && (
          <Link
            href={`/review/${gap.linkedIssueId}`}
            className="mt-3 inline-block text-xs font-medium text-ink underline underline-offset-4 hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            See the calls this affected
          </Link>
        )}
      </div>

      {draft && !writing && (
        <div className="border-t border-line bg-info-surface px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Status tone={ANSWER_STATUS_TONE.draft}>
              {ANSWER_STATUS_LABEL.draft}
            </Status>
            {target && (
              <span className="font-mono text-2xs text-faint">
                will live in {target.name}
              </span>
            )}
          </div>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink">
            {draft.answer}
          </p>
          <p className="mt-2 text-2xs text-faint">
            Written, not published. The AI is still declining this question.
          </p>
        </div>
      )}

      {writing && (
        <div className="border-t border-line px-4 py-3.5">
          <label
            htmlFor={`answer-${gap.id}`}
            className="text-xs font-medium text-ink"
          >
            The answer to give
          </label>
          <p className="mt-0.5 max-w-prose text-2xs text-muted">
            Write what a caller should be told, in the words you would use. The
            question stays as it was asked.
          </p>
          <Textarea
            id={`answer-${gap.id}`}
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="We do…"
            className="mt-2"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              icon={<Check className="size-3.5" />}
              disabled={trimmed.length === 0}
              loading={answer.isPending}
              onClick={() => answer.mutate(trimmed)}
            >
              Save as a draft answer
            </Button>
            <Button
              size="sm"
              variant="quiet"
              icon={<X className="size-3.5" />}
              disabled={answer.isPending}
              onClick={() => {
                setWriting(false);
                setText("");
              }}
            >
              Cancel
            </Button>
            {answer.isError && (
              <p className="text-2xs text-danger">
                That did not save. Nothing has changed — try again.
              </p>
            )}
          </div>
        </div>
      )}

      {!writing && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-3">
          {!mayEdit ? (
            <p className="flex items-center gap-1.5 text-2xs text-faint">
              <Lock className="size-3" aria-hidden />
              Writing an answer needs permission to approve answers.
            </p>
          ) : !target ? (
            <p className="text-2xs text-faint">
              There is nowhere to write this yet — a source maintained here has
              to exist before an answer can live in one.
            </p>
          ) : (
            <Button size="sm" onClick={open}>
              {draft ? "Edit the draft" : "Write the answer"}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * The honest band at the bottom of the decisions view.
 *
 * Every write on this screen lands in a draft, and a person who has just made
 * three decisions is entitled to know exactly how far those decisions have
 * travelled. Naming the two steps that remain — and that neither exists yet —
 * is the difference between a tool that is unfinished and one that is
 * misleading about being finished.
 */
function PublishNote() {
  const lexicon = useLexicon();

  return (
    <section className="rounded-panel border border-line bg-subtle px-5 py-4">
      <h2 className="text-sm font-medium text-ink">
        How a decision here reaches a call
      </h2>
      <ol className="mt-3 space-y-2 text-sm text-muted">
        <li className="flex gap-2.5">
          <span className="mt-0.5 font-mono text-2xs text-faint tabular">
            1
          </span>
          <span>
            It lands in the {lower(lexicon.employee.one)}&rsquo;s draft, which
            is what this screen writes to.
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="mt-0.5 font-mono text-2xs text-faint tabular">
            2
          </span>
          <span>
            The draft is rehearsed against recorded scenarios, so a change that
            breaks something else shows up before a caller finds it.
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="mt-0.5 font-mono text-2xs text-faint tabular">
            3
          </span>
          <span>
            It is published as a release, with a diff of what changed and a way
            back if it turns out wrong.
          </span>
        </li>
      </ol>
      <p className="mt-3 max-w-prose text-2xs text-faint">
        Steps 2 and 3 are the Simulator and Releases. Until a change goes
        through them, what customers hear on the phone is unchanged by anything
        decided here.
      </p>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sources
// ─────────────────────────────────────────────────────────────────────────────

function Sources({
  sources,
  items,
  employees,
}: {
  sources: KnowledgeSource[];
  items: KnowledgeItem[];
  employees: AIEmployee[];
}) {
  if (sources.length === 0) {
    return (
      <EmptyState
        tone="quiet"
        title="No sources"
        description="Nothing has been imported or written yet, so there is nothing for the AI to answer from."
      />
    );
  }

  // Failing first, then stale: a source that cannot sync is answering with
  // whatever it last read, which is a live wrong-answer risk rather than a
  // maintenance chore.
  const ordered = [...sources].sort(
    (a, b) => severity(b.status) - severity(a.status),
  );

  return (
    <div className="space-y-3">
      {ordered.map((source) => (
        <SourceCard
          key={source.id}
          source={source}
          items={items}
          employees={employees}
        />
      ))}

      <p className="max-w-prose pt-2 text-2xs text-faint">
        Adding a source — crawling a site, parsing a document, watching a
        connected system for changes — needs the ingest pipeline behind it, and
        that is not built. Nothing here fabricates it.
      </p>
    </div>
  );
}

function severity(status: KnowledgeSource["status"]): number {
  switch (status) {
    case "error":
      return 3;
    case "stale":
      return 2;
    case "syncing":
      return 1;
    default:
      return 0;
  }
}

function SourceCard({
  source,
  items,
  employees,
}: {
  source: KnowledgeSource;
  items: KnowledgeItem[];
  employees: AIEmployee[];
}) {
  const lexicon = useLexicon();
  const Icon = KIND_ICON[source.kind];
  const readers = employeesReadingFrom(source, employees);
  const mostUsed = itemsForSource(source.id, items).slice(0, 2);

  return (
    <article className="rounded-panel border border-line bg-elevated px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 gap-2.5">
          <Icon className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
          <div className="min-w-0">
            <h3 className="truncate text-md font-medium text-ink">
              {source.name}
            </h3>
            <p className="mt-0.5 font-mono text-2xs text-faint">
              {SOURCE_KIND_LABEL[source.kind]} · {source.origin}
            </p>
          </div>
        </div>
        <Status tone={SOURCE_STATUS_TONE[source.status]}>
          {SOURCE_STATUS_LABEL[source.status]}
        </Status>
      </div>

      {source.error && (
        <p className="mt-3 rounded-control bg-danger-surface px-3 py-2 font-mono text-2xs text-ink">
          {source.error}
        </p>
      )}

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5">
        <Stat label="Answers" value={source.itemCount.toString()} />
        <Stat
          label="Last read"
          value={
            source.lastSyncedAt ? relativeLong(source.lastSyncedAt) : "never"
          }
        />
        {source.conflictCount > 0 && (
          <Stat
            label="In conflict"
            value={`${source.conflictCount} ${source.conflictCount === 1 ? "topic" : "topics"}`}
            tone="danger"
          />
        )}
      </dl>

      {mostUsed.length > 0 && (
        <ul className="mt-3 space-y-1 border-l-2 border-line pl-3">
          {mostUsed.map((item) => (
            <li key={item.id} className="text-xs text-muted">
              <span className="text-ink">{item.question}</span>
              {item.useCount > 0 && (
                <span className="font-mono text-2xs text-faint tabular">
                  {" "}
                  · used {item.useCount}×
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Granted, not owned (§3.1) — and phrased that way, because "who is
          answering from this?" is the question that decides how much a failing
          source actually costs. */}
      <p className="mt-3 text-2xs text-faint">
        {readers.length > 0 ? (
          <>Granted to {readers.join(", ")}.</>
        ) : (
          <>
            Granted to no live {lower(lexicon.employee.one)} — nothing is
            answering from it.
          </>
        )}
      </p>
    </article>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div>
      <dt className="font-mono text-2xs tracking-wide text-faint uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-sm tabular",
          tone === "danger" ? "text-danger" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Answers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The library, grouped by state rather than sorted into one list.
 *
 * "Approved" and "draft" are not two ends of a quality scale — they are the
 * difference between an answer a caller can hear and one they cannot. Sorting
 * them together by use count would bury a freshly written draft at the bottom
 * (a draft has been used zero times, by definition) and quietly imply the two
 * kinds are interchangeable.
 */
function Answers({
  items,
  sources,
}: {
  items: KnowledgeItem[];
  sources: KnowledgeSource[];
}) {
  const [query, setQuery] = useState("");

  const matched = useMemo(
    () => items.filter((item) => matchesAnswer(item, query)),
    [items, query],
  );

  const groups = useMemo(
    () =>
      (["draft", "stale", "approved"] as const)
        .map((status) => ({
          status,
          items: matched
            .filter((item) => item.status === status)
            .sort((a, b) => b.useCount - a.useCount),
        }))
        .filter((group) => group.items.length > 0),
    [matched],
  );

  return (
    <div>
      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-faint"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search questions and answers"
          aria-label="Search questions and answers"
          className="pl-9"
        />
      </div>

      {matched.length === 0 ? (
        <EmptyState
          tone="quiet"
          className="mt-2"
          title="Nothing matches that"
          description="Search covers both the question and the answer text."
        />
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map((group) => (
            <section key={group.status}>
              <div className="flex items-center gap-2">
                <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
                  {ANSWER_STATUS_LABEL[group.status]}
                </h2>
                <span className="font-mono text-2xs text-faint tabular">
                  {group.items.length}
                </span>
              </div>
              {group.status !== "approved" && (
                <p className="mt-1.5 max-w-prose text-xs text-muted">
                  {group.status === "draft"
                    ? "Written but not published. The AI will not say these yet."
                    : "The source behind these has changed or has not been checked in a long time. They are still being said."}
                </p>
              )}
              <div className="mt-3 overflow-hidden rounded-panel border border-line bg-elevated">
                {group.items.map((item) => (
                  <AnswerRow
                    key={item.id}
                    item={item}
                    source={
                      sources.find((s) => s.id === item.sourceId) ?? null
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function AnswerRow({
  item,
  source,
}: {
  item: KnowledgeItem;
  source: KnowledgeSource | null;
}) {
  return (
    <div className="border-b border-line px-4 py-3.5 last:border-b-0">
      <h3 className="text-sm font-medium text-ink">{item.question}</h3>
      <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted">
        {item.answer}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-2xs text-faint">
        <SourceName source={source} fallbackId={item.sourceId} />
        <span className="tabular">
          {item.useCount > 0
            ? `used ${item.useCount}× in the last 30 days`
            : "not used yet"}
        </span>
        <span className="tabular">
          updated {relativeLong(item.updatedAt)}
        </span>
        {item.status !== "approved" && (
          <Status tone={ANSWER_STATUS_TONE[item.status]}>
            {ANSWER_STATUS_LABEL[item.status]}
          </Status>
        )}
      </div>
    </div>
  );
}

/** A source is always named, never shown as an id, even when it has gone. */
function SourceName({
  source,
  fallbackId,
}: {
  source: KnowledgeSource | null;
  fallbackId: string;
}) {
  if (!source) {
    return (
      <span className="font-mono text-2xs text-faint">
        a source that is no longer here ({fallbackId})
      </span>
    );
  }

  const Icon = KIND_ICON[source.kind];
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon className="size-3 shrink-0 text-faint" aria-hidden />
      <span className="truncate text-xs font-medium text-ink">
        {source.name}
      </span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rail
// ─────────────────────────────────────────────────────────────────────────────

function Rail({
  sources,
  counts,
  gaps,
}: {
  sources: KnowledgeSource[];
  counts: ReturnType<typeof answerCounts>;
  gaps: KnowledgeGap[];
}) {
  const lexicon = useLexicon();
  const health = sourceHealth(sources);
  const asked = totalAsked(gaps);

  return (
    <div className="sticky top-8 space-y-7">
      <div>
        <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
          Answerable today
        </h2>
        <p className="mt-2 font-display text-2xl text-ink tabular">
          {counts.approved.toLocaleString("en-GB")}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          approved answers the {lower(lexicon.employee.many)} may give. Drafts
          and out-of-date answers are not counted.
        </p>
      </div>

      <div>
        <h2 className="mb-2.5 font-mono text-2xs tracking-wide text-faint uppercase">
          Source health
        </h2>
        <div className="overflow-hidden rounded-panel border border-line bg-elevated">
          <HealthRow
            tone="success"
            label={SOURCE_STATUS_LABEL.ready}
            value={health.inUse}
          />
          {health.syncing.length > 0 && (
            <HealthRow
              tone="info"
              label={SOURCE_STATUS_LABEL.syncing}
              value={health.syncing.length}
            />
          )}
          {health.stale.length > 0 && (
            <HealthRow
              tone="warning"
              label={SOURCE_STATUS_LABEL.stale}
              value={health.stale.length}
            />
          )}
          {health.failing.length > 0 && (
            <HealthRow
              tone="danger"
              label={SOURCE_STATUS_LABEL.error}
              value={health.failing.length}
            />
          )}
        </div>
        {health.failing.length > 0 && (
          <p className="mt-2 text-2xs text-faint">
            A source that cannot sync keeps answering from whatever it last
            read.
          </p>
        )}
      </div>

      {asked > 0 && (
        <div>
          <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
            Asked and unanswered
          </h2>
          <p className="mt-2 font-display text-2xl text-ink tabular">
            {asked.toLocaleString("en-GB")}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            times a caller asked something nothing here covers. Each one was
            declined rather than guessed at.
          </p>
        </div>
      )}

      <div>
        <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
          When nothing answers
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          The AI says it cannot confirm and follows the fallback for that call —
          it never fills the gap with something plausible. The{" "}
          {lower(lexicon.conversation.many)} this happened on are in Review.
        </p>
        <Link
          href="/review"
          className="mt-2.5 inline-block text-xs font-medium text-ink underline underline-offset-4 hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Open Review
        </Link>
      </div>
    </div>
  );
}

function HealthRow({
  tone,
  label,
  value,
}: {
  tone: "success" | "info" | "warning" | "danger";
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5 last:border-b-0">
      <Status tone={tone}>{label}</Status>
      <span className="font-mono text-2xs text-faint tabular">{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// States
// ─────────────────────────────────────────────────────────────────────────────

function NoAccess() {
  const lexicon = useLexicon();
  return (
    <div className="mt-8 max-w-prose rounded-panel border border-line bg-elevated px-5 py-5">
      <p className="flex items-center gap-2 text-md font-medium text-ink">
        <Lock className="size-4 text-faint" aria-hidden />
        This surface belongs to builders
      </p>
      <p className="mt-2 text-sm text-muted">
        Knowledge decides what an {lower(lexicon.employee.one)} is allowed to
        tell {lower(lexicon.party.many)}. Your role works with the results of
        that — the {lower(lexicon.conversation.many)} it produces and the
        failures worth fixing — rather than with the answers themselves.
      </p>
      <Link
        href="/review"
        className="mt-4 inline-block text-sm font-medium text-ink underline underline-offset-4 hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        Go to Review
      </Link>
    </div>
  );
}

function KnowledgeSkeleton() {
  return (
    <div className="mt-9 space-y-3" aria-busy>
      <LoadingAnnouncement label="Loading the knowledge base" />
      {[0, 1, 2].map((card) => (
        <div key={card} className="rounded-panel border border-line bg-elevated">
          <div className="border-b border-line px-4 py-3.5">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
          <div className="px-4 py-3.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-2 h-3.5 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
