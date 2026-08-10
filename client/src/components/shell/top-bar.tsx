"use client";

import { useQuery } from "@tanstack/react-query";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Building2, Check, Search, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import { useScope } from "@/lib/store/scope";
import { useLexicon, useWorkspace } from "@/components/providers/app-providers";
import { LiveRail } from "@/components/shell/live-rail";
import { Kbd, useModifierKey } from "@/components/primitives/kbd";
import { Tooltip } from "@/components/primitives/tooltip";
import { money } from "@/lib/utils/time";
import { usePalette } from "@/components/shell/command-palette";

export function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-app px-3">
      <ScopeSelector />
      <div className="flex-1" />
      <CommandTrigger />
      <LiveRail />
      <SpendIndicator />
    </header>
  );
}

/**
 * Scope.
 *
 * Multi-site groups are the design target. A metric that silently mixes three
 * clinics is worse than no metric, so scope lives in the shell where it is
 * always visible — never buried in a per-page filter that someone forgets they
 * set.
 */
function ScopeSelector() {
  const { locations } = useWorkspace();
  const lexicon = useLexicon();
  const locationId = useScope((s) => s.locationId);
  const setLocation = useScope((s) => s.setLocation);

  const active = locations.find((l) => l.id === locationId);
  const label = active ? active.name : `All ${lexicon.location.many}`;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-7 items-center gap-2 rounded-control px-2",
            "text-sm text-ink transition-colors hover:bg-accent-surface",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          )}
        >
          <Building2 className="size-3.5 text-faint" aria-hidden />
          <span className="font-medium">{label}</span>
          {active && (
            <span className="rounded bg-subtle px-1 font-mono text-2xs text-muted">
              {active.code}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-[240px] rounded-panel border border-line bg-overlay p-1 shadow-dialog"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-2xs font-medium tracking-wide text-faint uppercase">
            Viewing
          </DropdownMenu.Label>

          <ScopeOption
            selected={locationId === null}
            onSelect={() => setLocation(null)}
            label={`All ${lexicon.location.many}`}
            detail={`${locations.length} ${lexicon.location.many.toLowerCase()}`}
          />

          <DropdownMenu.Separator className="my-1 h-px bg-line" />

          {locations.map((location) => (
            <ScopeOption
              key={location.id}
              selected={locationId === location.id}
              onSelect={() => setLocation(location.id)}
              label={location.name}
              detail={location.address}
            />
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ScopeOption({
  selected,
  onSelect,
  label,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  detail: string;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-start gap-2 rounded-control px-2 py-1.5",
        "text-sm outline-none data-highlighted:bg-accent-surface",
      )}
    >
      <Check
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          selected ? "text-ink" : "text-transparent",
        )}
        aria-hidden
      />
      <span className="min-w-0">
        <span className="block truncate text-ink">{label}</span>
        <span className="block truncate text-2xs text-faint">{detail}</span>
      </span>
    </DropdownMenu.Item>
  );
}

function CommandTrigger() {
  const open = usePalette((s) => s.open);
  const mod = useModifierKey();

  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        "flex h-7 items-center gap-2 rounded-full border border-line bg-elevated px-2.5",
        "text-xs text-muted transition-colors hover:bg-subtle hover:text-ink",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
      )}
    >
      <Search className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">Search or run a command</span>
      <Kbd className="hidden sm:inline-flex">{mod}K</Kbd>
    </button>
  );
}

/**
 * Spend.
 *
 * Per-minute cost is the single biggest anxiety for buyers of voice AI, and
 * hiding it in a billing page reads as a trap. It sits in the shell, with the
 * cap behaviour stated plainly on hover — "what happens when I hit the cap" is
 * a question the interface should answer before it is asked.
 */
function SpendIndicator() {
  const { data } = useQuery({
    queryKey: qk.usage,
    queryFn: () => service.getUsage(),
    refetchInterval: 60_000,
  });

  if (!data) return null;

  const pace = data.budgetMonth
    ? data.spendMonth / data.budgetMonth
    : null;
  const overPace = pace !== null && pace > 0.85;

  const capBehaviour = {
    notify: "you are notified and calls continue",
    voicemail: "calls go to voicemail",
    stop: "the AI stops answering",
  }[data.atCap];

  return (
    <Tooltip
      side="bottom"
      content={
        <span className="block max-w-[240px] leading-relaxed">
          {money(data.spendMonth)} of{" "}
          {data.budgetMonth ? money(data.budgetMonth) : "no"} monthly budget.{" "}
          {money(data.costPerResolution)} per resolved call. At the cap,{" "}
          {capBehaviour}.
        </span>
      }
    >
      <button
        type="button"
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs",
          "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          overPace
            ? "border-warning/30 bg-warning-surface text-warning"
            : "border-line bg-elevated text-muted hover:bg-subtle",
        )}
      >
        {overPace && <TriangleAlert className="size-3" aria-hidden />}
        <span className="font-medium tabular">{money(data.spendToday)}</span>
        <span className="hidden md:inline">today</span>
      </button>
    </Tooltip>
  );
}
