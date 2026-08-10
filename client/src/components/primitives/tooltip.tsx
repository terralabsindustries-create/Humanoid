"use client";

import * as RadixTooltip from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils/cn";

/**
 * Tooltips explain, they never hide. Anything a user must know to act belongs
 * on screen; a tooltip carries the secondary detail — the full timestamp behind
 * a relative one, the shortcut behind an icon, the definition behind a term.
 */
export function Tooltip({
  content,
  children,
  side = "bottom",
  shortcut,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  shortcut?: React.ReactNode;
}) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 flex items-center gap-2 rounded-control px-2 py-1",
            "border border-line bg-overlay text-xs text-ink shadow-overlay",
          )}
        >
          {content}
          {shortcut}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
