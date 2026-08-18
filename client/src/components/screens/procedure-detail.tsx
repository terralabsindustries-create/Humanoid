"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowLeft, CornerDownRight, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import { useLexicon } from "@/components/providers/app-providers";
import { Button } from "@/components/primitives/button";
import { Textarea } from "@/components/primitives/input";
import { Badge, Status, StatusPill } from "@/components/primitives/status";
import { EmptyState, ErrorState } from "@/components/primitives/empty-state";
import {
  LoadingAnnouncement,
  Skeleton,
} from "@/components/primitives/skeleton";
import {
  OUTCOME_LABEL,
  OUTCOME_TONE,
  STEP_BLOCKER_LABEL,
  STEP_BLOCKER_TONE,
  STEP_KIND_LABEL,
  TOOL_STATUS_SHORT,
  TOOL_STATUS_TONE,
} from "@/lib/domain/labels";
import { capabilityLabel } from "@/lib/domain/capabilities";
import {
  employeesRunning,
  stepBlocker,
  totalStopped,
} from "@/lib/domain/procedures";
import { employeeName } from "@/lib/domain/tools";
import { navItemById } from "@/lib/navigation";
import { lower } from "@/lib/lexicon";
import { dayAndTime, percent, relativeLong } from "@/lib/utils/time";
import type {
  AIEmployee,
  Conversation,
  Procedure,
  ProcedureStep,
  Tool,
  User,
} from "@/lib/domain/types";

/**
 * One procedure, read as a document.
 *
 * The spec's phrase is "readable procedures rather than node graphs", and the
 * consequence runs deeper than layout: the instruction is the content, and
 * everything else on a step — what it calls, what authority it uses, how often
 * it stops a run — is context arranged around the sentence rather than fields
 * the sentence is squeezed between.
 *
 * Two things this screen insists on, both of which a prettier version would
 * drop:
 *
 *   · **Every step names what happens when it fails.** A procedure that says
 *     what to do and not what to do instead is not a procedure, it is a happy
 *     path, and the gap is filled at runtime by whatever the model improvises.
 *
 *   · **An edit is a draft and says so at the point of the edit.** The AI keeps
 *     saying the old wording until a release carries the new one. A screen that
 *     let a rewrite look live would be lying at exactly the moment someone
 *     believes they have fixed something.
 */
export function ProcedureDetail({ procedureId }: { procedureId: string }) {
  const lexicon = useLexicon();

  const procedureQuery = useQuery({
    queryKey: qk.procedure(procedureId),
    queryFn: () => service.getProcedure(procedureId),
  });
  const toolsQuery = useQuery({
    queryKey: qk.tools,
    queryFn: () => service.listTools(),
  });
  const employeesQuery = useQuery({
    queryKey: qk.employees,
    queryFn: () => service.listEmployees(),
  });
  const usersQuery = useQuery({
    queryKey: qk.users,
    queryFn: () => service.listUsers(),
  });
  const historyQuery = useQuery({
    queryKey: qk.conversations({ procedureId }),
    queryFn: () => service.listConversations({ procedureId }),
  });

  if (procedureQuery.isError) {
    return (
      <Shell>
        <ErrorState
          title={`Could not load this ${lower(lexicon.procedure.one)}`}
          detail="The request did not come back. Nothing has been changed."
          onRetry={() => procedureQuery.refetch()}
        />
      </Shell>
    );
  }

  if (procedureQuery.isPending) {
    return (
      <Shell>
        <div aria-busy>
          <LoadingAnnouncement label="Loading procedure" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="mt-3 h-3.5 w-96" />
          <Skeleton className="mt-8 h-32 w-full" />
          <Skeleton className="mt-3 h-32 w-full" />
        </div>
      </Shell>
    );
  }

  const procedure = procedureQuery.data;

  if (!procedure) {
    return (
      <Shell>
        <EmptyState
          title={`No such ${lower(lexicon.procedure.one)}`}
          description="It may have been renamed or removed. The audit log records either."
          action={
            <Link
              href="/build/procedures"
              className="text-sm font-medium text-ink underline underline-offset-4 hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Back to {lower(lexicon.procedure.many)}
            </Link>
          }
        />
      </Shell>
    );
  }

  const tools = toolsQuery.data ?? [];
  const employees = employeesQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const runners = employeesRunning(procedure.id, employees);
  const lost = totalStopped(procedure);
  const drafts = procedure.steps.filter((step) => step.draft !== null).length;

  return (
    <Shell>
      <Link
        href="/build/procedures"
        className={cn(
          "-ml-1 mb-4 inline-flex items-center gap-1.5 rounded-control px-1 py-0.5",
          "text-xs font-medium text-muted transition-colors hover:text-ink",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        )}
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All {lower(lexicon.procedure.many)}
      </Link>

      <header>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h1 className="font-display text-3xl text-ink">{procedure.name}</h1>
          {procedure.status === "draft" && (
            <StatusPill tone="info">Not in use yet</StatusPill>
          )}
        </div>

        <p className="mt-3 max-w-prose text-md leading-relaxed text-muted">
          {procedure.description}
        </p>

        <dl className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-sm">
          <Pair label="Starts when">{procedure.trigger}</Pair>
          <Pair label="Run by">
            {runners.length === 0
              ? "Nobody"
              : runners.map(employeeName).join(", ")}
          </Pair>
          {procedure.runCount > 0 && (
            <Pair label="Finished">
              {percent(procedure.completionRate)} of {procedure.runCount} runs
            </Pair>
          )}
        </dl>

        {lost > 0 && (
          <p className="mt-4 max-w-prose text-sm text-muted">
            <span className="font-medium text-ink tabular">{lost}</span>{" "}
            {lost === 1 ? "run" : "runs"} did not finish. Each step below carries
            the number that stopped there, so the loss can be read against the
            wording that caused it rather than as a total.
          </p>
        )}
      </header>

      {drafts > 0 && (
        <div className="mt-6 rounded-panel bg-info-surface px-4 py-3">
          <p className="text-sm text-info">
            <span className="font-medium tabular">{drafts}</span>{" "}
            {drafts === 1 ? "step has" : "steps have"} an unpublished rewrite.
            Callers are still hearing the current wording.
          </p>
        </div>
      )}

      <ol className="mt-7 space-y-3">
        {numberSteps(procedure).map(({ step, number }) => (
          <li key={step.id}>
            <StepCard
              procedure={procedure}
              step={step}
              number={number}
              tools={tools}
              runners={runners}
              users={users}
            />
          </li>
        ))}
      </ol>

      <History
        conversations={historyQuery.data ?? []}
        loading={historyQuery.isPending}
      />
    </Shell>
  );
}

/**
 * Numbers only the steps a run walks in sequence.
 *
 * A side path keeps its position in the document — it is written where it is
 * relevant — but takes no number, so the numbering that is left describes an
 * actual route through the procedure rather than an array index.
 */
function numberSteps(
  procedure: Procedure,
): { step: ProcedureStep; number: number | null }[] {
  let position = 0;
  return procedure.steps.map((step) => ({
    step,
    number: step.offMainPath ? null : (position += 1),
  }));
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-8 sm:px-8 sm:py-12 xl:px-10">
      <div className="max-w-[46rem]">{children}</div>
    </div>
  );
}

function Pair({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-faint">{label}</dt>
      <dd className="text-muted">{children}</dd>
    </div>
  );
}

/**
 * One step.
 *
 * Reading order is deliberate and matches how someone reasons about a process:
 * what does it say, what does it need, what happens when that is not there, and
 * how often does it go wrong. The fallback is given the same weight as the
 * instruction rather than being tucked into a caption, because it is the half
 * that decides what a caller experiences on the bad day.
 */
function StepCard({
  procedure,
  step,
  number,
  tools,
  runners,
  users,
}: {
  procedure: Procedure;
  step: ProcedureStep;
  number: number | null;
  tools: Tool[];
  runners: AIEmployee[];
  users: User[];
}) {
  const lexicon = useLexicon();
  const [editing, setEditing] = useState(false);

  const tool = tools.find((candidate) => candidate.id === step.toolId) ?? null;
  const blocker = stepBlocker(step, tools, runners);
  const editor = users.find((user) => user.id === step.draft?.editedByUserId);

  return (
    <div
      className={cn(
        "rounded-panel border border-line bg-elevated px-4 py-4 sm:px-5",
        // Tinted only where something is actually wrong with the step, and
        // always beside a named reason — the tint speeds up the scan, the words
        // carry the meaning (rule 3).
        blocker && "border-warning/30 bg-warning-surface/30",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className="font-mono text-2xs text-faint tabular">
          {/*
            A side path keeps its place in the document but loses its number:
            numbering it would say a run reaches it after the step above, which
            is exactly what `offMainPath` records as untrue.
          */}
          {number === null ? "↳" : String(number).padStart(2, "0")}
        </span>
        <Badge>{STEP_KIND_LABEL[step.kind]}</Badge>
        {step.offMainPath && <Badge>Only from a branch</Badge>}
        {step.draft && <StatusPill tone="info">Rewritten, not live</StatusPill>}
      </div>

      {editing ? (
        <StepEditor
          procedure={procedure}
          step={step}
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
          <p className="mt-2 text-md leading-relaxed text-ink">
            {step.instruction}
          </p>

          <div className="mt-2.5 flex items-start gap-2">
            <CornerDownRight
              className="mt-1 size-3.5 shrink-0 text-faint"
              aria-hidden
            />
            <p className="text-sm text-muted">
              <span className="text-faint">If it cannot: </span>
              {step.fallback}
            </p>
          </div>

          {step.branches.length > 0 && (
            <ul className="mt-2.5 space-y-1.5 border-l border-line pl-3">
              {step.branches.map((branch) => (
                <li key={branch.when} className="text-sm">
                  <span className="text-faint">When </span>
                  <span className="text-muted">{lower(branch.when)}</span>
                  <span className="text-faint"> → </span>
                  <span className="text-muted">{branch.then}</span>
                </li>
              ))}
            </ul>
          )}

          {step.draft && (
            <DraftDiff
              step={step}
              procedure={procedure}
              editorName={editor?.name ?? "Someone"}
            />
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3">
            {tool && (
              <span className="inline-flex items-center gap-1.5">
                <Badge>{tool.name}</Badge>
                <Status tone={TOOL_STATUS_TONE[tool.status]} className="text-2xs">
                  {TOOL_STATUS_SHORT[tool.status]}
                </Status>
              </span>
            )}
            {step.capabilityId && (
              <Badge>{capabilityLabel(step.capabilityId, lexicon)}</Badge>
            )}
            {step.stoppedCount > 0 && (
              <span className="font-mono text-2xs text-muted tabular">
                stopped {step.stoppedCount} of {step.reachedCount}
              </span>
            )}

            <Button
              size="sm"
              variant="quiet"
              icon={<Pencil className="size-3.5" aria-hidden />}
              onClick={() => setEditing(true)}
              className="ml-auto"
            >
              {step.draft ? "Edit the rewrite" : "Rewrite"}
            </Button>
          </div>

          {blocker && (
            <p
              className={cn(
                "mt-2.5 text-2xs",
                blocker.kind === "tool_unreliable" ||
                  blocker.kind === "tool_not_granted" ||
                  blocker.kind === "not_authorised"
                  ? "text-warning"
                  : "text-danger",
              )}
            >
              <Status
                tone={STEP_BLOCKER_TONE[blocker.kind]}
                className="text-2xs"
              >
                {STEP_BLOCKER_LABEL[blocker.kind]}
              </Status>
              <span className="mt-0.5 block text-muted">
                {blocker.kind === "tool_not_granted" && blocker.tool
                  ? `${blocker.employees.map(employeeName).join(", ")} runs this ${lower(lexicon.procedure.one)} without being granted ${blocker.tool.name}, so this step cannot complete.`
                  : blocker.kind === "not_authorised"
                    ? `${blocker.employees.map(employeeName).join(", ")} is not authorised for what this step does, so it hands over instead.`
                    : blocker.tool
                      ? blocker.tool.error ??
                        `${blocker.tool.name} is not answering reliably.`
                      : "The action this step names is not in the workspace."}
              </span>
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The rewrite, shown beside what is live rather than in place of it.
 *
 * A diff rather than a replacement because the question an editor actually has
 * is "is my version better than what it says now?", and that cannot be answered
 * by a text box containing only the new version.
 */
function DraftDiff({
  step,
  procedure,
  editorName,
}: {
  step: ProcedureStep;
  procedure: Procedure;
  editorName: string;
}) {
  const queryClient = useQueryClient();
  const draft = step.draft;
  const simulator = navItemById("simulator");

  const discard = useMutation({
    mutationFn: () =>
      service.discardProcedureStepDraft({
        procedureId: procedure.id,
        stepId: step.id,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.procedure(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: qk.procedures });
    },
  });

  if (!draft) return null;

  const instructionChanged = draft.instruction !== step.instruction;
  const fallbackChanged = draft.fallback !== step.fallback;

  return (
    <div className="mt-3 rounded-panel bg-info-surface px-3 py-2.5">
      <p className="font-mono text-2xs tracking-wide text-info uppercase">
        Rewritten, not published
      </p>

      {instructionChanged && (
        <p className="mt-1.5 text-sm leading-relaxed text-ink">
          {draft.instruction}
        </p>
      )}
      {fallbackChanged && (
        <p className="mt-1.5 text-sm text-muted">
          <span className="text-faint">If it cannot: </span>
          {draft.fallback}
        </p>
      )}

      <p className="mt-2 text-2xs text-muted">
        {editorName} wrote this {relativeLong(draft.editedAt)}. Callers still
        hear the wording above it
        {simulator ? (
          <>
            {" — rehearse it in "}
            <Link
              href={simulator.href}
              className="font-medium underline underline-offset-2 hover:text-ink"
            >
              the simulator
            </Link>
            {" before it is published."}
          </>
        ) : (
          " until it is published."
        )}
      </p>

      <Button
        size="sm"
        variant="quiet"
        className="mt-2"
        loading={discard.isPending}
        icon={<X className="size-3.5" aria-hidden />}
        onClick={() => discard.mutate()}
      >
        Discard the rewrite
      </Button>

      {discard.isError && (
        <p role="alert" className="mt-2 text-2xs font-medium text-danger">
          That did not save. The rewrite is still here — try again.
        </p>
      )}
    </div>
  );
}

function StepEditor({
  procedure,
  step,
  onDone,
}: {
  procedure: Procedure;
  step: ProcedureStep;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [instruction, setInstruction] = useState(
    step.draft?.instruction ?? step.instruction,
  );
  const [fallback, setFallback] = useState(
    step.draft?.fallback ?? step.fallback,
  );

  const save = useMutation({
    mutationFn: () =>
      service.editProcedureStep({
        procedureId: procedure.id,
        stepId: step.id,
        instruction,
        fallback,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.procedure(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: qk.procedures });
      onDone();
    },
  });

  const unchanged =
    instruction.trim() === (step.draft?.instruction ?? step.instruction) &&
    fallback.trim() === (step.draft?.fallback ?? step.fallback);

  return (
    <form
      className="mt-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (instruction.trim() && fallback.trim()) save.mutate();
      }}
    >
      <label className="block">
        <span className="font-mono text-2xs tracking-wide text-faint uppercase">
          What it does
        </span>
        <Textarea
          autoFocus
          rows={2}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          className="mt-1.5 text-sm"
        />
      </label>

      <label className="mt-3 block">
        <span className="font-mono text-2xs tracking-wide text-faint uppercase">
          What happens if it cannot
        </span>
        <Textarea
          rows={3}
          value={fallback}
          onChange={(event) => setFallback(event.target.value)}
          className="mt-1.5 text-sm"
        />
      </label>

      <p className="mt-2 text-2xs text-muted">
        Saving writes a draft. Nothing a caller hears changes until it is
        published through Releases, with a diff and a rollback.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={save.isPending}
          disabled={unchanged || !instruction.trim() || !fallback.trim()}
        >
          Save as a draft
        </Button>
        <Button size="sm" variant="quiet" onClick={onDone}>
          Cancel
        </Button>
      </div>

      {save.isError && (
        <p role="alert" className="mt-2 text-2xs font-medium text-danger">
          That did not save. Nothing has changed — try again.
        </p>
      )}
    </form>
  );
}

/**
 * Execution history — the secondary view the spec asks for.
 *
 * Deliberately short and deliberately linked: the conversation timeline is
 * where a run is actually reconstructed, and duplicating it here would produce
 * two accounts of the same call that can disagree.
 */
function History({
  conversations,
  loading,
}: {
  conversations: Conversation[];
  loading: boolean;
}) {
  const lexicon = useLexicon();

  return (
    <section className="mt-10 border-t border-line pt-5">
      <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
        Where it has run
      </h2>

      {loading ? (
        <Skeleton className="mt-3 h-16 w-full" />
      ) : conversations.length === 0 ? (
        <p className="mt-2.5 max-w-prose text-sm text-muted">
          No {lower(lexicon.conversation.one)} in the current window ran this.
          Older ones are kept for as long as your retention policy says and
          appear here when this surface reads them.
        </p>
      ) : (
        <ol className="mt-3 space-y-px">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/conversations/${conversation.id}`}
                className={cn(
                  "flex items-start justify-between gap-4 rounded-panel px-3 py-2.5",
                  "transition-colors odd:bg-subtle/50 hover:bg-subtle",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    {conversation.intent ??
                      `${lexicon.call.one} from ${conversation.fromLabel}`}
                  </p>
                  <p className="mt-1 font-mono text-2xs text-faint">
                    {dayAndTime(conversation.startedAt)}
                  </p>
                </div>
                <StatusPill tone={OUTCOME_TONE[conversation.outcome]}>
                  {OUTCOME_LABEL[conversation.outcome]}
                </StatusPill>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
