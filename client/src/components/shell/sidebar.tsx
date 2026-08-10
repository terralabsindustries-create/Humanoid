"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { ChevronsLeft, ChevronsRight, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { SPRING, TRANSITION } from "@/lib/tokens/motion";
import {
  accessibleItems,
  accessibleModes,
  modeForPath,
  resolveLabel,
  type Mode,
  type NavItem,
} from "@/lib/navigation";
import { useDomainPack, useLexicon, useWorkspace } from "@/components/providers/app-providers";
import { resolveNavLabel } from "@/lib/domains/registry";
import { usePreferences } from "@/lib/store/preferences";
import { Tooltip } from "@/components/primitives/tooltip";
import { Kbd } from "@/components/primitives/kbd";
import { useQuery } from "@tanstack/react-query";
import { qk, service } from "@/lib/services";

export function Sidebar() {
  const pathname = usePathname();
  const lexicon = useLexicon();
  const domainPack = useDomainPack();
  const { workspace, user } = useWorkspace();
  const collapsed = usePreferences((s) => s.sidebarCollapsed);
  const setPreference = usePreferences((s) => s.set);

  const capabilities = user?.capabilities ?? [];
  const modes = accessibleModes(capabilities);
  const activeMode = modeForPath(pathname);
  const mode = modes.find((m) => m.id === activeMode) ?? modes[0];

  const issuesQuery = useQuery({
    queryKey: qk.issues(),
    queryFn: () => service.listReviewIssues(),
  });
  const liveQuery = useQuery({
    queryKey: qk.conversations({ live: true }),
    queryFn: () => service.listConversations({ live: true }),
    refetchInterval: 10_000,
  });

  const openIssues =
    issuesQuery.data?.filter((i) => i.status === "open").length ?? 0;
  const liveCount = liveQuery.data?.length ?? 0;

  return (
    <motion.nav
      aria-label="Main"
      animate={{ width: collapsed ? 60 : 224 }}
      transition={TRANSITION.panel}
      className={cn(
        "relative z-20 flex h-full shrink-0 flex-col",
        "border-r border-line bg-app",
      )}
    >
      {/* Workspace identity. Not a switcher yet — one workspace in this build,
          but the affordance stays so the layout does not shift when it lands. */}
      <div
        className={cn(
          "flex h-12 items-center gap-2 px-3",
          collapsed && "justify-center px-0",
        )}
      >
        <div
          className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent text-2xs font-semibold text-accent-fg"
          aria-hidden
        >
          {workspace?.name.charAt(0) ?? "·"}
        </div>
        {!collapsed && (
          <span className="truncate text-sm font-medium text-ink">
            {workspace?.name ?? "Loading"}
          </span>
        )}
      </div>

      {/* A single-mode user gets no switcher — a control with one option is
          noise, and the shell should shrink to the job the person actually
          has. */}
      {modes.length > 1 && (
        <ModeSwitcher
          modes={modes}
          capabilities={capabilities}
          activeMode={mode.id}
          collapsed={collapsed}
        />
      )}

      <ul className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-2">
        {accessibleItems(mode, capabilities)
          .map((item) => (
            <NavRow
              key={item.id}
              item={item}
              collapsed={collapsed}
              active={
                pathname === item.href || pathname.startsWith(`${item.href}/`)
              }
              label={resolveNavLabel(item.id, resolveLabel(item.label, lexicon), domainPack)}
              count={
                item.badge === "review"
                  ? openIssues
                  : item.badge === "live"
                    ? liveCount
                    : 0
              }
            />
          ))}
      </ul>

      <div className="border-t border-line p-2">
        <NavRow
          item={{
            id: "preferences",
            href: "/preferences",
            icon: Settings2,
            label: "Preferences",
          }}
          collapsed={collapsed}
          active={pathname === "/preferences"}
          label="Preferences"
          count={0}
        />
        <button
          type="button"
          onClick={() => setPreference("sidebarCollapsed", !collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "mt-0.5 flex h-8 w-full items-center gap-2.5 rounded-control px-2",
            "text-xs text-faint transition-colors hover:bg-accent-surface hover:text-muted",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? (
            <ChevronsRight className="size-4 shrink-0" aria-hidden />
          ) : (
            <>
              <ChevronsLeft className="size-4 shrink-0" aria-hidden />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </motion.nav>
  );
}

function ModeSwitcher({
  modes,
  capabilities,
  activeMode,
  collapsed,
}: {
  modes: Mode[];
  capabilities: string[];
  activeMode: Mode["id"];
  collapsed: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="Workspace mode"
      className={cn(
        "mx-2 flex gap-0.5 rounded-input bg-subtle p-0.5",
        collapsed && "mx-1.5 flex-col",
      )}
    >
      {modes.map((mode) => {
        const active = mode.id === activeMode;
        const Icon = mode.icon;
        // Land on the first section this user can actually open, not the
        // first section that exists.
        const landing = accessibleItems(mode, capabilities)[0].href;
        const content = (
          <Link
            key={mode.id}
            href={landing}
            role="tab"
            aria-selected={active}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded-[9px] py-1.5",
              "text-2xs font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
              active ? "text-ink" : "text-faint hover:text-muted",
            )}
          >
            {active && (
              // Shared layout: the indicator travels between modes rather than
              // blinking, so the switch reads as one surface moving.
              <motion.span
                layoutId="mode-indicator"
                transition={SPRING.indicator}
                className="absolute inset-0 rounded-[9px] bg-elevated shadow-raised"
              />
            )}
            <Icon className="relative size-3.5 shrink-0" aria-hidden />
            {!collapsed && <span className="relative">{mode.label}</span>}
          </Link>
        );

        return collapsed ? (
          <Tooltip key={mode.id} content={mode.label} side="right">
            {content}
          </Tooltip>
        ) : (
          content
        );
      })}
    </div>
  );
}

function NavRow({
  item,
  active,
  collapsed,
  label,
  count,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  label: string;
  count: number;
}) {
  const Icon = item.icon;

  const row = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-8 items-center gap-2.5 rounded-control px-2",
        "text-sm transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        active ? "text-ink" : "text-muted hover:bg-accent-surface hover:text-ink",
        collapsed && "justify-center px-0",
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-indicator"
          transition={SPRING.indicator}
          className="absolute inset-0 rounded-control bg-accent-surface"
        />
      )}
      <Icon className="relative size-4 shrink-0" aria-hidden />
      {!collapsed && (
        <>
          <span className="relative flex-1 truncate">{label}</span>
          {count > 0 && (
            <span
              className={cn(
                "relative rounded-full px-1.5 py-0.5 text-2xs font-medium tabular",
                item.badge === "live"
                  ? "bg-ai-surface text-ai"
                  : "bg-warning-surface text-warning",
              )}
            >
              {count}
            </span>
          )}
        </>
      )}
    </Link>
  );

  if (!collapsed) return <li>{row}</li>;

  return (
    <li>
      <Tooltip
        content={label}
        side="right"
        shortcut={item.chord ? <Kbd>g {item.chord}</Kbd> : undefined}
      >
        {row}
      </Tooltip>
    </li>
  );
}
