"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, motion } from "motion/react";
import { ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { TRANSITION } from "@/lib/tokens/motion";
import { qk, service } from "@/lib/services";
import { StatusDot } from "@/components/primitives/status";
import { LiveConversationRow } from "@/components/domain/live-conversation-row";
import { EmptyState } from "@/components/primitives/empty-state";
import { relative } from "@/lib/utils/time";
import { useScope } from "@/lib/store/scope";

/**
 * The live rail.
 *
 * Live is not a page (interface-architecture.md §3.4). A dedicated Live screen
 * is empty most of the day for a clinic, and a nav item that is usually empty
 * trains people to stop looking at it — fatal for the one surface that must
 * never be ignored. Instead this strip persists in every mode, so the live
 * picture is always in peripheral vision and one click from detail.
 */
export function LiveRail() {
  const scope = useScope();

  const liveQuery = useQuery({
    queryKey: qk.conversations({ live: true, scope }),
    queryFn: () => service.listConversations({ live: true, scope }),
    refetchInterval: 5_000,
  });
  const approvalsQuery = useQuery({
    queryKey: qk.approvals,
    queryFn: () => service.listPendingApprovals(),
    refetchInterval: 5_000,
  });
  const healthQuery = useQuery({
    queryKey: qk.health,
    queryFn: () => service.getConnectionHealth(),
    refetchInterval: 15_000,
  });

  const conversations = liveQuery.data ?? [];
  const waiting = conversations.filter((c) => c.status === "waiting");
  const active = conversations.filter(
    (c) => c.status === "active" || c.status === "wrapping",
  );
  const ringing = conversations.filter((c) => c.status === "ringing");
  const approvals = approvalsQuery.data ?? [];

  // Only claim staleness once health is actually known. Reporting "stale"
  // while the first check is still in flight cries wolf on every page load,
  // which is exactly how a real degradation gets ignored.
  const degraded = healthQuery.data
    ? healthQuery.data.realtime !== "connected"
    : false;
  const total = conversations.length;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-7 items-center gap-2.5 rounded-full border px-2.5",
            "text-xs transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            waiting.length > 0 || approvals.length > 0
              ? "border-warning/30 bg-warning-surface"
              : "border-line bg-elevated hover:bg-subtle",
          )}
          // One accessible sentence rather than three disconnected numbers.
          aria-label={`Live activity: ${active.length} in progress, ${waiting.length} waiting, ${approvals.length} awaiting approval`}
        >
          <span className="flex items-center gap-1.5">
            <StatusDot tone="ai" live={active.length > 0} />
            <span className="font-medium text-ink tabular">{total}</span>
            <span className="text-muted">live</span>
          </span>

          {waiting.length > 0 && (
            <span className="flex items-center gap-1.5 border-l border-line-strong pl-2.5">
              <StatusDot tone="warning" live />
              <span className="font-medium text-warning tabular">
                {waiting.length}
              </span>
              <span className="text-warning">waiting</span>
            </span>
          )}

          {approvals.length > 0 && (
            <span className="flex items-center gap-1.5 border-l border-line-strong pl-2.5">
              <ShieldQuestion className="size-3 text-warning" aria-hidden />
              <span className="font-medium text-warning tabular">
                {approvals.length}
              </span>
            </span>
          )}

          {degraded && (
            <span className="flex items-center gap-1.5 border-l border-line-strong pl-2.5 text-danger">
              <StatusDot tone="danger" />
              <span>stale</span>
            </span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[min(380px,calc(100vw-24px))] outline-none"
          asChild
        >
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={TRANSITION.fast}
            className="overflow-hidden rounded-panel border border-line bg-overlay shadow-dialog"
          >
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="text-xs font-medium text-ink">Live now</span>
              <span className="font-mono text-2xs text-faint">
                {degraded
                  ? `updated ${relative(healthQuery.data?.lastUpdatedAt ?? "")}`
                  : "updating live"}
              </span>
            </div>

            {/* Degradation is shown, never hidden. Silent stale data on a live
                operations surface is worse than an visible error. */}
            {degraded && (
              <p className="border-b border-line bg-danger-surface px-3 py-2 text-xs text-danger">
                Live updates are not connected. These figures may be out of
                date.
              </p>
            )}

            <div className="max-h-[min(60vh,420px)] overflow-y-auto">
              <AnimatePresence initial={false}>
                {[...waiting, ...ringing, ...active].map((conversation) => (
                  <motion.div
                    key={conversation.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={TRANSITION.fast}
                  >
                    <LiveConversationRow conversation={conversation} />
                  </motion.div>
                ))}
              </AnimatePresence>

              {total === 0 && !liveQuery.isLoading && (
                <div className="px-3">
                  <EmptyState
                    tone="quiet"
                    title="Nothing live right now"
                    description="Incoming calls appear here the moment they connect."
                  />
                </div>
              )}
            </div>

            <Link
              href="/conversations?live=1"
              className="block border-t border-line px-3 py-2 text-xs font-medium text-ink hover:bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
            >
              Open live operations
            </Link>
          </motion.div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
