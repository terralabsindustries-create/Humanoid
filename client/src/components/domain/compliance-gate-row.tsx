"use client";

import { CircleSlash, ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Status, StatusPill } from "@/components/primitives/status";
import { GATE_STATUS_LABEL, GATE_STATUS_TONE } from "@/lib/domain/labels";
import { retentionFor, retentionLabel } from "@/lib/domain/compliance";
import { relative } from "@/lib/utils/time";
import type {
  ComplianceGate,
  ComplianceGateStatus,
  RetentionPolicy,
  User,
} from "@/lib/domain/types";

/**
 * One compliance gate, as a row.
 *
 * Three states, three shields — met, breached, ruled out — so the state
 * survives greyscale and a glance across a room, which is rule 3 and also just
 * how these get read: nobody reads a compliance list, they scan it for the row
 * that is not the same shape as the others.
 *
 * The `requirement` field is rendered differently depending on status, because
 * the same sentence means two different things. On an unmet gate it is a task
 * someone has to do. On a met one it is the condition that keeps it met — the
 * thing that would break if a published version changed underneath it. Labelling
 * both "Requirement" would make the list read as uniformly outstanding.
 */

const GATE_ICON: Record<ComplianceGateStatus, typeof ShieldCheck> = {
  met: ShieldCheck,
  action_needed: ShieldAlert,
  not_applicable: CircleSlash,
};

const GATE_ICON_COLOUR: Record<ComplianceGateStatus, string> = {
  met: "text-success",
  action_needed: "text-warning",
  not_applicable: "text-faint",
};

export function GateMark({
  status,
  className,
}: {
  status: ComplianceGateStatus;
  className?: string;
}) {
  // Indexed inline rather than through a helper that returns a component, for
  // the same reason as RecordStatus: a call site that looks like a component
  // definition during render is the one thing that would remount these.
  const Icon = GATE_ICON[status];
  return (
    <Icon
      className={cn("size-4 shrink-0", GATE_ICON_COLOUR[status], className)}
      aria-hidden
    />
  );
}

export function GateStatusPill({ status }: { status: ComplianceGateStatus }) {
  const Icon = GATE_ICON[status];
  return (
    <StatusPill
      tone={GATE_STATUS_TONE[status]}
      icon={<Icon className="size-3 shrink-0" aria-hidden />}
    >
      {GATE_STATUS_LABEL[status]}
    </StatusPill>
  );
}

export function ComplianceGateRow({
  gate,
  owner,
  retention,
}: {
  gate: ComplianceGate;
  /** Resolved from the gate's owner id; absent when the owner has left. */
  owner: User | undefined;
  /** Every retention policy — the row picks out its own, if it has one. */
  retention: RetentionPolicy[];
}) {
  const unmet = gate.status === "action_needed";
  const policy = retentionFor(gate, retention);

  return (
    <article
      className={cn(
        "border-b border-line px-4 py-4 last:border-b-0",
        gate.status === "not_applicable" && "bg-subtle/40",
      )}
    >
      <div className="flex items-start gap-3">
        <GateMark status={gate.status} className="mt-0.5" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
            <h3
              className={cn(
                "text-md font-medium",
                gate.status === "not_applicable" ? "text-muted" : "text-ink",
              )}
            >
              {gate.name}
            </h3>
            <GateStatusPill status={gate.status} />
          </div>

          <p className="mt-1.5 max-w-prose text-sm text-muted">{gate.detail}</p>

          {/* The live figure, not a number typed into the prose months ago.
              A gate arguing that recordings are kept too long has to quote the
              policy it is arguing with, or the two drift and both stop being
              trustworthy. */}
          {policy && (
            <p className="mt-2 text-sm text-muted">
              <span className="text-faint">{policy.dataType} today:</span>{" "}
              <span className="font-medium text-ink tabular">
                {retentionLabel(policy.retainForDays)}
              </span>
            </p>
          )}

          <div
            className={cn(
              "mt-3 rounded-control px-3 py-2.5",
              unmet ? "bg-warning-surface" : "bg-subtle",
            )}
          >
            <p className="font-mono text-2xs tracking-wide text-faint uppercase">
              {unmet
                ? "To clear this"
                : gate.status === "met"
                  ? "Stays met while"
                  : "Would apply if"}
            </p>
            <p
              className={cn(
                "mt-1 text-sm",
                unmet ? "text-ink" : "text-muted",
              )}
            >
              {gate.requirement}
            </p>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
            <span>
              {owner ? (
                <>
                  Owned by <span className="text-muted">{owner.name}</span>
                </>
              ) : (
                "No owner assigned"
              )}
            </span>
            <span aria-hidden>·</span>
            {gate.lastReviewedAt ? (
              <span>reviewed {relative(gate.lastReviewedAt)} ago</span>
            ) : (
              /* Never reviewed is a finding in itself, so it is stated as one
                 rather than shown as an empty slot. */
              <Status tone="warning" className="text-xs font-normal">
                never reviewed
              </Status>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
