"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils/cn";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { LiveRail } from "@/components/shell/live-rail";
import {
  CommandPalette,
  KeyboardLayer,
} from "@/components/shell/command-palette";
import { MODES, resolveLabel } from "@/lib/navigation";
import { useDomainPack, useLexicon } from "@/components/providers/app-providers";
import { resolveNavLabel } from "@/lib/domains/registry";
import { qk, service } from "@/lib/services";

/**
 * The application shell.
 *
 * Deliberately spare: navigation, a status bar, and the workspace. No space is
 * permanently reserved for optional panels — the contextual panel overlays the
 * detail view when it is needed and costs nothing when it is not.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-app">
      <a
        href="#workspace"
        className={cn(
          "sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-100",
          "focus:rounded-control focus:bg-accent focus:px-3 focus:py-2",
          "focus:text-sm focus:text-accent-fg",
        )}
      >
        Skip to content
      </a>

      {/* The sidebar is the desktop and tablet navigation. On phones the
          product is an on-call tool, not a shrunken dashboard, so it is
          replaced by a bottom bar carrying only the jobs that matter there. */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="hidden md:block">
          <TopBar />
        </div>
        <MobileTopBar />

        <main
          id="workspace"
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto pb-14 md:pb-0"
        >
          {children}
        </main>
      </div>

      <MobileNav />
      <CommandPalette />
      <KeyboardLayer />
    </div>
  );
}

function MobileTopBar() {
  const pathname = usePathname();
  const lexicon = useLexicon();
  const domainPack = useDomainPack();

  const current = MODES.flatMap((m) => m.items).find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-4 md:hidden">
      <h1 className="truncate text-md font-medium text-ink">
        {current
          ? resolveNavLabel(current.id, resolveLabel(current.label, lexicon), domainPack)
          : "Humanoid"}
      </h1>
      {/* "Know something is wrong" is one of the five jobs mobile has to do
          well, so the live state travels to the phone rather than being a
          desktop luxury. */}
      <LiveRail />
    </header>
  );
}

/**
 * Mobile navigation.
 *
 * Four destinations, matching the five jobs mobile actually has to do well:
 * receive a handoff, watch and take over a live call, approve an action, review
 * a conversation, and know something is wrong. Build and Govern are not here —
 * editing a procedure on a phone is not a real workflow, and pretending it is
 * would be worse than leaving it out.
 */
function MobileNav() {
  const pathname = usePathname();
  const lexicon = useLexicon();
  const domainPack = useDomainPack();

  const liveQuery = useQuery({
    queryKey: qk.conversations({ live: true }),
    queryFn: () => service.listConversations({ live: true }),
    refetchInterval: 10_000,
  });
  const issuesQuery = useQuery({
    queryKey: qk.issues(),
    queryFn: () => service.listReviewIssues(),
  });

  const counts: Record<string, number> = {
    conversations: liveQuery.data?.length ?? 0,
    review:
      issuesQuery.data?.filter((issue) => issue.status === "open").length ?? 0,
  };

  const items = MODES[0].items.filter((item) =>
    ["today", "conversations", "records", "review"].includes(item.id),
  );

  return (
    <nav
      aria-label="Main"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 flex h-14 items-stretch",
        "border-t border-line bg-app md:hidden",
        // Keeps targets clear of the home indicator on iOS.
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        const count = counts[item.id] ?? 0;

        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-0.5",
              // 44px minimum target, met by the 56px bar height.
              "text-2xs transition-colors",
              active ? "text-ink" : "text-faint",
            )}
          >
            <span className="relative">
              <Icon className="size-5" aria-hidden />
              {count > 0 && (
                <span
                  className={cn(
                    "absolute -top-1 -right-2 min-w-4 rounded-full px-1",
                    "text-[10px] leading-4 font-medium tabular",
                    item.badge === "live"
                      ? "bg-ai text-app"
                      : "bg-warning text-app",
                  )}
                >
                  {count}
                </span>
              )}
            </span>
            {resolveNavLabel(item.id, resolveLabel(item.label, lexicon), domainPack)}
          </Link>
        );
      })}
    </nav>
  );
}
