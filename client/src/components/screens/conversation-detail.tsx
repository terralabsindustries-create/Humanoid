"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bot, Info, Phone, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import { useDomainPack, useLexicon, useWorkspace } from "@/components/providers/app-providers";
import { resolveNavLabel } from "@/lib/domains/registry";
import { ControlIndicator } from "@/components/domain/control-indicator";
import { Badge, Status, StatusPill } from "@/components/primitives/status";
import { EmptyState, ErrorState } from "@/components/primitives/empty-state";
import { Skeleton, SkeletonText } from "@/components/primitives/skeleton";
import {
  ACTION_STATUS_LABEL,
  ACTION_STATUS_TONE,
  BLOCKER_LABEL,
  CHANNEL_LABEL,
  GROUNDING_SHORT,
  GROUNDING_TONE,
  INTERVENTION_LABEL,
  OUTCOME_LABEL,
  OUTCOME_TONE,
  PROCEDURE_STEP_LABEL,
  PROCEDURE_STEP_TONE,
} from "@/lib/domain/labels";
import { clockTime, dayAndTime, duration } from "@/lib/utils/time";
import { lower } from "@/lib/lexicon";
import type { Turn, User } from "@/lib/domain/types";

/**
 * One conversation, in full: the transcript, and everything the AI did or a
 * person changed around it.
 *
 * A conversation captured by the real Twilio pipeline only ever populates the
 * transcript, timing and outcome — actions, procedure runs and interventions
 * stay empty arrays rather than invented content, because none of that
 * infrastructure exists yet (see the root CLAUDE.md, rule 13). Northgate's
 * fixture data exercises every section this screen can render.
 */
export function ConversationDetail({ id }: { id: string }) {
  const lexicon = useLexicon();
  const domainPack = useDomainPack();
  const { workspace, user: currentUser } = useWorkspace();
  const timezone = workspace?.timezone ?? "Europe/London";

  const query = useQuery({
    queryKey: qk.conversation(id),
    queryFn: () => service.getConversation(id),
  });

  const partyId = query.data?.partyId ?? null;
  const partyQuery = useQuery({
    queryKey: qk.party(partyId ?? ""),
    queryFn: () => service.getParty(partyId!),
    enabled: !!partyId,
  });

  const usersQuery = useQuery({ queryKey: qk.users, queryFn: () => service.listUsers() });
  const userName = (userId: string | null): string | null => {
    if (!userId) return null;
    if (currentUser?.id === userId) return currentUser.name;
    return usersQuery.data?.find((u: User) => u.id === userId)?.name ?? null;
  };

  const listLabel = resolveNavLabel("conversations", lexicon.conversation.many, domainPack);

  const conversation = query.data;
  const isLive = conversation?.status === "active";

  const groupedTurns = useMemo(() => conversation?.turns ?? [], [conversation]);

  return (
    <div className="px-5 py-8 sm:px-8 sm:py-12 xl:px-10">
      <div className="max-w-3xl">
        <Link
          href="/conversations"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to {lower(listLabel)}
        </Link>

        {query.isError ? (
          <ErrorState
            className="mt-6"
            title="Could not load this conversation"
            detail="The conversations service did not respond. Try again in a moment."
            onRetry={() => query.refetch()}
          />
        ) : query.isLoading ? (
          <div className="mt-6 space-y-6">
            <Skeleton className="h-8 w-2/3" />
            <SkeletonText lines={4} />
          </div>
        ) : !conversation ? (
          <EmptyState
            className="mt-6"
            title="Conversation not found"
            description="It may have been removed, or it belongs to a different workspace."
          />
        ) : (
          <>
            <header className="mt-4 mb-8">
              <div className="flex flex-wrap items-center gap-2.5">
                {isLive ? (
                  <ControlIndicator control={conversation.control} activity={conversation.activity} live />
                ) : (
                  <StatusPill tone={OUTCOME_TONE[conversation.outcome]}>
                    {OUTCOME_LABEL[conversation.outcome]}
                  </StatusPill>
                )}
                <Badge>{CHANNEL_LABEL[conversation.channel]}</Badge>
              </div>

              <h1 className="mt-3 font-display text-2xl text-ink">
                {partyQuery.data?.displayName ?? conversation.fromLabel}
              </h1>
              {conversation.intent && (
                <p className="mt-1 text-md text-muted">{conversation.intent}</p>
              )}

              <p className="mt-2 text-xs text-faint">
                {dayAndTime(conversation.startedAt, timezone)} · {duration(conversation.effort.durationSeconds)}
                {partyQuery.data && (
                  <>
                    {" · "}
                    <span className="font-mono">{conversation.fromLabel}</span>
                  </>
                )}
              </p>
            </header>

            {conversation.blocker && (
              <div className="mb-8 rounded-panel border border-warning-surface bg-warning-surface/40 px-4 py-3">
                <Status tone="warning">{BLOCKER_LABEL[conversation.blocker]}</Status>
                {conversation.escalatedToUserId && (
                  <p className="mt-1 text-xs text-muted">
                    Escalated to {userName(conversation.escalatedToUserId) ?? "a team member"}.
                  </p>
                )}
              </div>
            )}

            {conversation.summary && (
              <Section title="Summary">
                <p className="text-sm leading-relaxed text-ink">{conversation.summary}</p>
              </Section>
            )}

            <Section title="Transcript">
              {groupedTurns.length === 0 ? (
                <p className="text-sm text-muted">No speech was captured on this call.</p>
              ) : (
                <ol className="space-y-4">
                  {groupedTurns.map((turn) => (
                    <TurnRow key={turn.id} turn={turn} timezone={timezone} />
                  ))}
                </ol>
              )}
            </Section>

            {conversation.procedureRun && conversation.procedureRun.steps.length > 0 && (
              <Section title="Procedure">
                <ol className="space-y-2">
                  {conversation.procedureRun.steps.map((step) => (
                    <li key={step.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-ink">{step.label}</span>
                      <StatusPill tone={PROCEDURE_STEP_TONE[step.status]}>
                        {PROCEDURE_STEP_LABEL[step.status]}
                      </StatusPill>
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            {conversation.actions.length > 0 && (
              <Section title="Actions taken">
                <ul className="space-y-3">
                  {conversation.actions.map((action) => (
                    <li key={action.id} className="text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-ink">{action.label}</span>
                        <StatusPill tone={ACTION_STATUS_TONE[action.status]}>
                          {ACTION_STATUS_LABEL[action.status]}
                        </StatusPill>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{action.reason}</p>
                      {action.error && (
                        <p className="mt-0.5 text-xs text-danger">{action.error}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {conversation.interventions.length > 0 && (
              <Section title="Human intervention">
                <ul className="space-y-3">
                  {conversation.interventions.map((intervention) => (
                    <li key={intervention.id} className="text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-ink">
                          {userName(intervention.userId) ?? "A team member"} —{" "}
                          {lower(INTERVENTION_LABEL[intervention.kind])}
                        </span>
                        <span className="shrink-0 text-xs text-faint">
                          {clockTime(intervention.at, timezone)}
                        </span>
                      </div>
                      {intervention.note && (
                        <p className="mt-0.5 text-xs text-muted">{intervention.note}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title="Recording">
              <p className="text-sm text-muted">
                {conversation.recordingConsent === "declined"
                  ? "The caller declined to be recorded."
                  : conversation.recordingAvailable
                    ? "A recording is available."
                    : "No recording is available for this call."}
              </p>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 border-t border-line pt-5">
      <h2 className="mb-3 font-mono text-2xs tracking-wide text-faint uppercase">{title}</h2>
      {children}
    </section>
  );
}

const SPEAKER_ICON: Record<Turn["speaker"], React.ComponentType<{ className?: string }>> = {
  ai: Bot,
  customer: Phone,
  human_agent: UserIcon,
  system: Info,
};

const SPEAKER_LABEL: Record<Turn["speaker"], string> = {
  ai: "AI",
  customer: "Caller",
  human_agent: "Team member",
  system: "System",
};

function TurnRow({ turn, timezone }: { turn: Turn; timezone: string }) {
  const Icon = SPEAKER_ICON[turn.speaker];
  const isAi = turn.speaker === "ai" || turn.speaker === "human_agent";

  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
          isAi ? "bg-ai-surface text-ai" : "bg-neutral-surface text-muted",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-ink">{SPEAKER_LABEL[turn.speaker]}</span>
          <span className="text-2xs text-faint">{clockTime(turn.at, timezone)}</span>
          {turn.grounding && (
            <StatusPill tone={GROUNDING_TONE[turn.grounding]}>
              {GROUNDING_SHORT[turn.grounding]}
            </StatusPill>
          )}
        </div>
        <p className="mt-0.5 text-sm leading-relaxed text-ink">{turn.text}</p>
      </div>
    </li>
  );
}
