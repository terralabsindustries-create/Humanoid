"use client";

import Link from "next/link";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import {
  useDomainPack,
  useLexicon,
  useWorkspace,
} from "@/components/providers/app-providers";
import { Button } from "@/components/primitives/button";
import { ErrorState } from "@/components/primitives/empty-state";
import {
  LoadingAnnouncement,
  Skeleton,
  SkeletonText,
} from "@/components/primitives/skeleton";
import { Status, StatusPill } from "@/components/primitives/status";
import {
  IssueTags,
  SeverityMark,
} from "@/components/domain/review-issue-row";
import {
  BLOCKER_LABEL,
  FIX_KIND_LABEL,
  ISSUE_STATUS_LABEL,
  ISSUE_STATUS_TONE,
  OUTCOME_LABEL,
  OUTCOME_TONE,
  SEVERITY_LABEL,
  SEVERITY_TONE,
} from "@/lib/domain/labels";
import { FIX_DESTINATION } from "@/lib/domain/review";
import {
  hasCapability,
  navItemById,
  resolveLabel,
  type NavItem,
} from "@/lib/navigation";
import { resolveNavLabel, type DomainPack } from "@/lib/domains/registry";
import { SCREENS } from "@/lib/screen-registry";
import { count, lower, type Lexicon } from "@/lib/lexicon";
import { dayAndTime, duration,  relativeAgo } from "@/lib/utils/time";
import type {
  Conversation,
  IssueStatus,
  ProposedFix,
  ReviewIssue,
} from "@/lib/domain/types";

/**
 * A destination's own name, resolved exactly as the sidebar resolves it —
 * lexicon first, then the industry pack's override. "Applied in Knowledge"
 * has to use the same word the navigation uses, or it reads as a different
 * place.
 */
function navLabel(
  item: NavItem,
  lexicon: Lexicon,
  pack: DomainPack | null,
): string {
  return resolveNavLabel(item.id, resolveLabel(item.label, lexicon), pack);
}

/**
 * One review issue.
 *
 * The job here is judgement, and judgement needs evidence — so the calls that
 * produced this cause are shown in full on the page rather than linked away to.
 * A person deciding whether to change what the AI tells customers should not
 * have to take the queue's word for what happened.
 *
 * The screen deliberately stops at judgement. The proposed fix is shown as a
 * before/after and the path it would take is named, but nothing here applies
 * it: the change is made in Build, against a draft, and has to pass simulation
 * before a customer meets it. A one-click "apply" on this screen would be both
 * a lie about what is built and a bad idea once it is.
 */
export function ReviewIssueDetail({ id }: { id: string }) {
  const issueQuery = useQuery({
    queryKey: qk.issue(id),
    queryFn: () => service.getReviewIssue(id),
  });

  if (issueQuery.isError) {
    return (
      <Page>
        <BackLink />
        <ErrorState
          title="Could not load this review item"
          detail="The review service did not respond. Calls are unaffected — the rest of the queue is still available."
          onRetry={() => issueQuery.refetch()}
        />
      </Page>
    );
  }

  if (issueQuery.isPending) {
    return (
      <Page>
        <BackLink />
        <div className="mt-6" aria-busy>
          <LoadingAnnouncement label="Loading this review item" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-3 h-7 w-4/5" />
          <SkeletonText className="mt-6" lines={3} />
        </div>
      </Page>
    );
  }

  const issue = issueQuery.data;

  if (!issue) {
    return (
      <Page>
        <BackLink />
        <div className="mt-6">
          <h1 className="font-display text-2xl text-ink">
            There is no review item with this reference
          </h1>
          <p className="mt-3 max-w-prose text-md text-muted">
            It may have been resolved and closed automatically once the cause
            behind it stopped recurring, or the link may be from an older
            version of the workspace.
          </p>
          <Link
            href="/review"
            className="mt-5 inline-block text-sm font-medium text-ink underline underline-offset-4 hover:text-muted"
          >
            Back to the review queue
          </Link>
        </div>
      </Page>
    );
  }

  return <IssueBody issue={issue} />;
}

function IssueBody({ issue }: { issue: ReviewIssue }) {
  const lexicon = useLexicon();

  return (
    <Page rail={<Facts issue={issue} />}>
      <BackLink />

      <header className="mt-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <IssueTags issue={issue} />
          <StatusPill tone={ISSUE_STATUS_TONE[issue.status]}>
            {ISSUE_STATUS_LABEL[issue.status]}
          </StatusPill>
        </div>

        <h1 className="mt-3 flex items-start gap-2.5 font-display text-2xl text-ink">
          <SeverityMark severity={issue.severity} className="mt-1.5 size-5" />
          <span className="min-w-0">{issue.title}</span>
        </h1>

        <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">
          {issue.detail}
        </p>

        {/* The rail carries this on a wide screen; below xl it would otherwise
            vanish, and blast radius is the whole argument for acting. */}
        <p className="mt-4 text-sm text-muted xl:hidden">
          Affecting{" "}
          <span className="font-medium text-ink tabular">
            {count(issue.affectedConversationCount, lexicon.conversation)}
          </span>{" "}
          · first seen {relativeAgo(issue.firstSeenAt)} · last seen{" "}
          {relativeAgo(issue.lastSeenAt)}
        </p>
      </header>

      <div className="mt-10 space-y-10">
        <Evidence issue={issue} />
        <Fix issue={issue} />
        <Triage issue={issue} />
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
        <div className="min-w-0 max-w-[46rem] flex-1">{children}</div>
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
  return (
    <Link
      href="/review"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      Review
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
      <div className="mb-3.5 flex items-baseline justify-between gap-4">
        <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
          {label}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** The metadata that answers "how urgent, how big, whose is it". */
function Facts({ issue }: { issue: ReviewIssue }) {
  const lexicon = useLexicon();

  const usersQuery = useQuery({
    queryKey: qk.users,
    queryFn: () => service.listUsers(),
  });
  const employeeQuery = useQuery({
    queryKey: qk.employee(issue.employeeId),
    queryFn: () => service.getEmployee(issue.employeeId),
  });

  const assignee = issue.assignedToUserId
    ? usersQuery.data?.find((user) => user.id === issue.assignedToUserId)
    : undefined;
  const employee = employeeQuery.data;
  const employeeName =
    employee?.liveVersion?.persona.name ??
    employee?.draftVersion?.persona.name ??
    null;

  return (
    <dl className="space-y-4">
      <Fact label="Severity">
        <Status tone={SEVERITY_TONE[issue.severity]}>
          {SEVERITY_LABEL[issue.severity]}
        </Status>
      </Fact>

      <Fact label="Affecting">
        <span className="text-ink tabular">
          {count(issue.affectedConversationCount, lexicon.conversation)}
        </span>
      </Fact>

      <Fact label="First seen">
        <span className="text-ink">{dayAndTime(issue.firstSeenAt)}</span>
      </Fact>

      <Fact label="Last seen">
        <span className="text-ink">
          {dayAndTime(issue.lastSeenAt)}{" "}
          <span className="text-faint">({relativeAgo(issue.lastSeenAt)})</span>
        </span>
      </Fact>

      <Fact label={lexicon.employee.one}>
        <span className="text-ink">
          {employeeName ?? (employeeQuery.isPending ? "…" : "Not known")}
        </span>
      </Fact>

      <Fact label="Assigned to">
        <span className={assignee ? "text-ink" : "text-faint"}>
          {assignee?.name ?? "Nobody yet"}
        </span>
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

/**
 * Evidence.
 *
 * A sample of the conversations behind the cause, shown rather than counted.
 * Failed actions carry their error verbatim: a person judging whether the
 * calendar is really the problem needs the timeout string, not a paraphrase.
 */
function Evidence({ issue }: { issue: ReviewIssue }) {
  const lexicon = useLexicon();

  const results = useQueries({
    queries: issue.evidenceConversationIds.map((id) => ({
      queryKey: qk.conversation(id),
      queryFn: () => service.getConversation(id),
    })),
  });

  const loading = results.some((result) => result.isPending);
  const conversations = results
    .map((result) => result.data)
    .filter((value): value is Conversation => Boolean(value));

  return (
    <Band label="Evidence">
      {loading ? (
        <SkeletonText lines={3} />
      ) : conversations.length === 0 ? (
        <p className="text-sm text-muted">
          No {lower(lexicon.conversation.many)} are attached to this one. It was
          raised from an aggregate signal rather than from specific{" "}
          {lower(lexicon.call.many)}.
        </p>
      ) : (
        <>
          <div className="space-y-3">
            {conversations.map((conversation) => (
              <EvidenceCard key={conversation.id} conversation={conversation} />
            ))}
          </div>

          <p className="mt-3.5 text-xs text-faint">
            {conversations.length} of{" "}
            {count(issue.affectedConversationCount, lexicon.conversation)}{" "}
            attached as evidence — a sample, not the whole list. Open one for
            the full transcript.
          </p>
        </>
      )}
    </Band>
  );
}

/**
 * One piece of evidence, and the way into the call behind it.
 *
 * The card carries enough to judge without leaving the page — outcome, named
 * blocker, and any failed action with its error verbatim — and opens the full
 * transcript for the times that is not enough. Judgement that has to be taken
 * on trust is not judgement.
 */
function EvidenceCard({ conversation }: { conversation: Conversation }) {
  const failures = conversation.actions.filter(
    (action) => action.status === "failed",
  );

  return (
    <Link
      href={`/conversations/${conversation.id}`}
      className={cn(
        "group block rounded-panel border border-line bg-elevated p-4",
        "transition-colors hover:border-line-strong hover:bg-subtle",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={OUTCOME_TONE[conversation.outcome]}>
            {OUTCOME_LABEL[conversation.outcome]}
          </StatusPill>
          {conversation.blocker && (
            <span className="text-xs text-warning">
              {BLOCKER_LABEL[conversation.blocker]}
            </span>
          )}
        </div>
        <span className="font-mono text-2xs text-faint tabular">
          {relativeAgo(conversation.startedAt)} ·{" "}
          {duration(conversation.effort.durationSeconds)}
        </span>
      </div>

      <p className="mt-2.5 flex items-start gap-1.5 text-sm font-medium text-ink">
        <span className="min-w-0">
          {conversation.intent ?? "No intent recorded"}
        </span>
        <ArrowUpRight
          className="mt-0.5 size-3.5 shrink-0 text-faint transition-colors group-hover:text-ink"
          aria-hidden
        />
      </p>
      <p className="mt-0.5 font-mono text-xs text-faint">
        {conversation.fromLabel}
      </p>

      {conversation.summary && (
        <p className="mt-2 text-sm text-muted">{conversation.summary}</p>
      )}

      {failures.map((action) => (
        <div
          key={action.id}
          className="mt-2.5 rounded-control bg-danger-surface px-3 py-2"
        >
          <p className="text-xs font-medium text-danger">{action.label}</p>
          {action.error && (
            <p className="mt-0.5 font-mono text-2xs break-words text-danger">
              {action.error}
            </p>
          )}
        </div>
      ))}
    </Link>
  );
}

/** The proposed change, and the route it would have to travel to go live. */
function Fix({ issue }: { issue: ReviewIssue }) {
  const fix = issue.proposedFix;

  if (!fix) {
    return (
      <Band label="Proposed fix">
        <p className="max-w-prose text-md text-muted">
          Nothing is proposed for this one. The cause is understood but the
          right answer is a judgement call — someone has to decide what the AI
          should say or do instead, and that decision is not one to guess at.
        </p>
      </Band>
    );
  }

  return (
    <>
      <Band label="Proposed fix">
        <p className="text-md text-ink">{fix.summary}</p>
        <Diff fix={fix} />
      </Band>
      <NextSteps issue={issue} fix={fix} />
    </>
  );
}

function Diff({ fix }: { fix: ProposedFix }) {
  return (
    <div className="mt-4 overflow-hidden rounded-panel border border-line">
      <DiffRow
        marker="before"
        label="Now"
        value={fix.before ?? "Nothing covers this today."}
        muted={fix.before === null}
      />
      <DiffRow marker="after" label="After the fix" value={fix.after} />
    </div>
  );
}

function DiffRow({
  marker,
  label,
  value,
  muted = false,
}: {
  marker: "before" | "after";
  label: string;
  value: string;
  muted?: boolean;
}) {
  const Icon = marker === "before" ? Minus : Plus;

  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-3",
        marker === "before"
          ? "border-b border-line bg-subtle"
          : "bg-success-surface",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          marker === "before" ? "text-faint" : "text-success",
        )}
        aria-hidden
      />
      <div className="min-w-0">
        <p
          className={cn(
            "font-mono text-2xs tracking-wide uppercase",
            marker === "before" ? "text-faint" : "text-success",
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "mt-1 text-sm",
            muted ? "text-faint italic" : "text-ink",
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

/**
 * What happens to a fix — and, honestly, what does not happen yet.
 *
 * Review hands work to Build; it does not make the change itself. That is a
 * product decision (a fix must batch into a draft and pass simulation, never
 * mutate a live employee), and separately, none of the machinery exists yet.
 * Both are said plainly here, because a button that pretends otherwise is
 * exactly the kind of thing this codebase does not ship.
 */
function NextSteps({ issue, fix }: { issue: ReviewIssue; fix: ProposedFix }) {
  const lexicon = useLexicon();
  const { user } = useWorkspace();
  const capabilities = user?.capabilities ?? [];

  const destination = FIX_DESTINATION[fix.kind];
  const canApply = hasCapability(capabilities, destination.capability);
  const releasePhase = SCREENS["/build/releases"]?.phase;

  return (
    <Band label="Applying this fix">
      <p className="max-w-prose text-md text-muted">
        {FIX_KIND_LABEL[fix.kind]} — applied in{" "}
        <Destination navItemId={destination.navItemId} capabilities={capabilities} />
        . It never goes straight to the phone line: it lands in a draft, and
        that draft has to pass simulation before anyone can publish it.
      </p>

      <ol className="mt-4 space-y-2.5">
        <Step index={1} label="Land the change in a draft">
          Batched with everything else changing, so improvements ship as one
          release rather than being edited into something already answering{" "}
          {lower(lexicon.call.many)}.
        </Step>
        <Step index={2} label="Simulate against real failures">
          Including the {count(issue.affectedConversationCount, lexicon.conversation)}{" "}
          behind this one, replayed as scenarios.
        </Step>
        <Step index={3} label="Publish with a diff and a rollback">
          Who changed what, why, and one action to undo it.
        </Step>
      </ol>

      <div className="mt-5 rounded-panel border border-line bg-subtle px-4 py-3.5">
        <p className="text-sm text-ink">
          {canApply
            ? "None of that is wired up yet."
            : "Your role can judge this and hand it on — making the change itself needs a builder."}
        </p>
        <p className="mt-1 text-sm text-muted">
          {canApply ? (
            <>
              Drafts, the simulator and releases arrive in{" "}
              {releasePhase ?? "a later phase"}. Nothing on this screen changes
              what the AI does today.
            </>
          ) : (
            <>
              Nothing on this screen changes what the AI does — and the draft,
              simulation and release surfaces that would carry the change arrive
              in {releasePhase ?? "a later phase"}.
            </>
          )}
        </p>
      </div>
    </Band>
  );
}

/**
 * Where this cause stands, and the only thing on this screen that writes.
 *
 * Worth being exact about what it is: triage, not repair. Moving a cause to
 * "being fixed" tells everyone else looking at the queue that someone has it;
 * marking it resolved records a judgement that it has been dealt with. Neither
 * touches what the AI employee says or does — that change is made in Build,
 * against a draft, and the band above says so.
 *
 * The four status tabs on the queue are its whole structure, so a version of
 * this screen where nothing could move between them would leave three of the
 * four permanently empty and the tabs would be decoration.
 */
function Triage({ issue }: { issue: ReviewIssue }) {
  const { user } = useWorkspace();
  const capabilities = user?.capabilities ?? [];
  const queryClient = useQueryClient();

  const move = useMutation({
    mutationFn: (status: IssueStatus) =>
      service.updateReviewIssueStatus(issue.id, status),
    // The queue and this screen read the same causes under one key prefix, so
    // one invalidation keeps a status the queue is showing from disagreeing
    // with the one on the row you just changed.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["review", "issues"] }),
  });

  if (!hasCapability(capabilities, "issue.resolve")) {
    return (
      <Band label="Where this stands">
        <p className="max-w-prose text-md text-muted">
          This is {lower(ISSUE_STATUS_LABEL[issue.status])}. Your role can read
          the queue and act on what it finds; moving a cause through it —
          picking it up, closing it, setting it aside — is someone else&rsquo;s
          call.
        </p>
      </Band>
    );
  }

  const transitions = TRANSITIONS[issue.status];

  return (
    <Band label="Where this stands">
      <p className="max-w-prose text-md text-muted">{STANDING[issue.status]}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {transitions.map((transition) => (
          <Button
            key={transition.status}
            variant={transition.variant}
            size="sm"
            loading={move.isPending && move.variables === transition.status}
            disabled={move.isPending}
            onClick={() => move.mutate(transition.status)}
          >
            {transition.label}
          </Button>
        ))}
      </div>

      {move.isError && (
        <p className="mt-3 text-sm text-danger">
          That did not save. The cause is unchanged — try again.
        </p>
      )}
    </Band>
  );
}

/**
 * What each status means, said as a state of the world rather than as a label.
 * "Open" on its own tells someone nothing they could not see from the pill.
 */
const STANDING: Record<IssueStatus, string> = {
  open: "Nobody has picked this up. It is still counting against the queue, and every occurrence since it was raised is still landing on it.",
  in_progress:
    "Someone has this. It stays in the queue and keeps counting occurrences — being worked on is not the same as stopped.",
  resolved:
    "This has been dealt with. If it happens again it comes back to the top of the queue, because a cause that recurs was not fixed.",
  dismissed:
    "Set aside deliberately: understood, and judged not worth changing anything for. It stays dismissed even if it happens again — that is the point of dismissing it rather than resolving it.",
};

/** Where a cause can go from where it is, and which move is the expected one. */
const TRANSITIONS: Record<
  IssueStatus,
  { status: IssueStatus; label: string; variant: "primary" | "secondary" | "quiet" }[]
> = {
  open: [
    { status: "in_progress", label: "I'm fixing this", variant: "primary" },
    { status: "dismissed", label: "Set aside", variant: "quiet" },
  ],
  in_progress: [
    { status: "resolved", label: "Mark dealt with", variant: "primary" },
    { status: "open", label: "Hand it back", variant: "quiet" },
  ],
  resolved: [{ status: "open", label: "Reopen", variant: "secondary" }],
  dismissed: [{ status: "open", label: "Reopen", variant: "secondary" }],
};

/**
 * The Build surface a fix would be made on — as a link only for someone
 * allowed to work there. Offering an operator a door onto a wall is the exact
 * thing capability-gated navigation exists to prevent.
 */
function Destination({
  navItemId,
  capabilities,
}: {
  navItemId: string;
  capabilities: string[];
}) {
  const lexicon = useLexicon();
  const pack = useDomainPack();
  const item = navItemById(navItemId);

  if (!item) return <span className="text-ink">Build</span>;

  const label = navLabel(item, lexicon, pack);

  if (!hasCapability(capabilities, item.capability)) {
    return <span className="text-ink">{label}</span>;
  }

  return (
    <Link
      href={item.href}
      className="text-ink underline underline-offset-4 hover:text-muted"
    >
      {label}
    </Link>
  );
}

function Step({
  index,
  label,
  children,
}: {
  index: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-subtle font-mono text-2xs text-muted tabular"
        aria-hidden
      >
        {index}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="mt-0.5 text-sm text-muted">{children}</p>
      </div>
    </li>
  );
}
