"use client";

import {
  BookOpen,
  ClipboardList,
  Minus,
  Plug,
  Plus,
  ScrollText,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { StatusPill } from "@/components/primitives/status";
import { changeAreaLabel } from "@/lib/domain/releases";
import { useLexicon } from "@/components/providers/app-providers";
import type { ReleaseChange } from "@/lib/domain/types";

/**
 * One change in a release, as a before and an after.
 *
 * The diff is the whole argument for or against publishing, so it is shown
 * literally — the sentence the AI used to say beside the sentence it will say
 * instead — rather than summarised into "persona updated". Someone approving a
 * change to what a business says to its customers is entitled to read both.
 *
 * Area icons are deliberately neutral in colour. The only thing here allowed a
 * tone is `raisesAuthority`, because that is a status — this release widens
 * what the AI may do without asking — and it carries a shape and a sentence
 * alongside the colour rather than relying on hue.
 */

const AREA_ICON: Record<ReleaseChange["area"], LucideIcon> = {
  persona: UserRound,
  knowledge: BookOpen,
  procedure: ClipboardList,
  tool: Plug,
  authority: ShieldCheck,
  policy: ScrollText,
};

export function AreaMark({
  area,
  className,
}: {
  area: ReleaseChange["area"];
  className?: string;
}) {
  const Icon = AREA_ICON[area];
  return <Icon className={cn("size-3.5 shrink-0 text-faint", className)} aria-hidden />;
}

/** The full diff — every change with what it replaces. */
export function ReleaseChangeList({ changes }: { changes: ReleaseChange[] }) {
  const lexicon = useLexicon();

  if (changes.length === 0) {
    return (
      <p className="text-sm text-muted">
        This release contains no changes. There is nothing to publish and
        nothing to review.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {changes.map((change, index) => (
        <li
          // Changes carry no id in the model and two can legitimately share an
          // area, so position within the release is the only stable key.
          key={`${change.area}-${index}`}
          className="overflow-hidden rounded-panel border border-line bg-elevated"
        >
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-3.5 pb-3">
            <div className="flex min-w-0 items-start gap-2">
              <AreaMark area={change.area} className="mt-0.5" />
              <div className="min-w-0">
                <p className="font-mono text-2xs tracking-wide text-faint uppercase">
                  {changeAreaLabel(change.area, lexicon)}
                </p>
                <p className="mt-1 text-sm font-medium text-ink">
                  {change.summary}
                </p>
              </div>
            </div>
            {change.raisesAuthority && (
              <StatusPill
                tone="warning"
                icon={<TriangleAlert className="size-3" aria-hidden />}
              >
                Raises authority
              </StatusPill>
            )}
          </div>

          <ChangeRow
            marker="before"
            value={change.before}
            emptyLabel="Nothing covered this before."
          />
          <ChangeRow marker="after" value={change.after} />
        </li>
      ))}
    </ul>
  );
}

function ChangeRow({
  marker,
  value,
  emptyLabel,
}: {
  marker: "before" | "after";
  value: string | null;
  emptyLabel?: string;
}) {
  const Icon = marker === "before" ? Minus : Plus;
  const empty = value === null;

  return (
    <div
      className={cn(
        "flex gap-3 border-t border-line px-4 py-3",
        marker === "before" ? "bg-subtle" : "bg-success-surface",
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
          {marker === "before" ? "Was" : "Becomes"}
        </p>
        <p className={cn("mt-1 text-sm", empty ? "text-faint italic" : "text-ink")}>
          {empty ? (emptyLabel ?? "Nothing.") : value}
        </p>
      </div>
    </div>
  );
}

/**
 * The one-line version, for history rows where the diff is behind a
 * disclosure. Says what changed and where, and keeps the authority warning —
 * that one has to survive being collapsed.
 */
export function ReleaseChangeSummary({ changes }: { changes: ReleaseChange[] }) {
  const lexicon = useLexicon();

  return (
    <ul className="space-y-1.5">
      {changes.map((change, index) => (
        <li
          key={`${change.area}-${index}`}
          className="flex items-baseline gap-2 text-sm"
        >
          <AreaMark area={change.area} className="translate-y-0.5" />
          <span className="min-w-0 text-muted">
            <span className="text-faint">
              {changeAreaLabel(change.area, lexicon)} ·{" "}
            </span>
            {change.summary}
            {change.raisesAuthority && (
              <span className="ml-1.5 inline-flex items-center gap-1 align-baseline text-2xs font-medium text-warning">
                <TriangleAlert className="size-3 translate-y-px" aria-hidden />
                Raises authority
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
