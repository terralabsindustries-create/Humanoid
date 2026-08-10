"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { create } from "zustand";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import {
  Contrast,
  LogOut,
  Moon,
  PanelLeft,
  Rows3,
  Sun,
  Volume2,
  VolumeX,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { TRANSITION } from "@/lib/tokens/motion";
import { qk, service } from "@/lib/services";
import {
  MODES,
  accessibleItems,
  accessibleModes,
  hasCapability,
  resolveLabel,
} from "@/lib/navigation";
import { useDomainPack, useLexicon, useWorkspace } from "@/components/providers/app-providers";
import { resolveNavLabel } from "@/lib/domains/registry";
import { usePreferences } from "@/lib/store/preferences";
import { useAuth } from "@/lib/store/auth";
import { tactile } from "@/lib/interaction/tactile";
import { useScope } from "@/lib/store/scope";
import { authService } from "@/lib/services/auth";
import { Kbd } from "@/components/primitives/kbd";
import { ControlGlyph } from "@/components/domain/control-indicator";
import { duration } from "@/lib/utils/time";

type PaletteStore = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

export const usePalette = create<PaletteStore>((set, get) => ({
  isOpen: false,
  // The palette is summoned by keystroke, so its feedback lives here rather
  // than on a trigger element the tactile layer could see.
  open: () => {
    if (!get().isOpen) tactile("open");
    set({ isOpen: true });
  },
  close: () => {
    if (get().isOpen) tactile("close");
    set({ isOpen: false });
  },
  toggle: () => {
    const next = !get().isOpen;
    tactile(next ? "open" : "close");
    set({ isOpen: next });
  },
}));

/**
 * The command palette.
 *
 * This is the primary navigation for anyone who uses the product all day; the
 * sidebar is for discovery. It crosses all three modes, which is what keeps the
 * mode split from turning into hunting — you never need to know which mode a
 * thing lives in to reach it.
 *
 * Only commands that genuinely do something appear here. Actions that change
 * live state (take over, pause an employee, publish a release) land when their
 * surfaces do — a palette entry that opens a "coming soon" toast is the kind of
 * fake affordance that makes people stop trusting the whole list.
 */
export function CommandPalette() {
  const router = useRouter();
  const { isOpen, close } = usePalette();
  const lexicon = useLexicon();
  const domainPack = useDomainPack();
  const { user, locations } = useWorkspace();

  const preferences = usePreferences();
  const signOut = useAuth((s) => s.signOut);
  const setLocation = useScope((s) => s.setLocation);

  const liveQuery = useQuery({
    queryKey: qk.conversations({ live: true }),
    queryFn: () => service.listConversations({ live: true }),
    enabled: isOpen,
  });

  const capabilities = useMemo(() => user?.capabilities ?? [], [user]);

  const go = (href: string) => {
    router.push(href);
    close();
  };

  const run = (action: () => void) => {
    action();
    close();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(next) => !next && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed top-[15vh] left-1/2 z-50 w-[min(92vw,600px)] -translate-x-1/2 outline-none"
          asChild
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={TRANSITION.standard}
          >
            <VisuallyHidden>
              <Dialog.Title>Search and commands</Dialog.Title>
              <Dialog.Description>
                Search across the workspace or run a command. Use arrow keys to
                move and Enter to select.
              </Dialog.Description>
            </VisuallyHidden>

            <Command
              loop
              className="overflow-hidden rounded-dialog border border-line bg-overlay shadow-dialog"
            >
              <Command.Input
                autoFocus
                placeholder="Search or run a command…"
                className={cn(
                  "h-12 w-full border-b border-line bg-transparent px-4",
                  "text-md text-ink outline-none placeholder:text-faint",
                )}
              />

              <Command.List className="max-h-[min(56vh,400px)] overflow-y-auto p-1.5">
                <Command.Empty className="px-3 py-8 text-center text-sm text-muted">
                  No matches. Try a different word.
                </Command.Empty>

                {(liveQuery.data ?? []).length > 0 && (
                  <Group heading="Live now">
                    {liveQuery.data!.map((conversation) => (
                      <Item
                        key={conversation.id}
                        value={`live ${conversation.fromLabel} ${conversation.intent ?? ""}`}
                        onSelect={() => go(`/conversations/${conversation.id}`)}
                        icon={
                          <ControlGlyph
                            control={conversation.control}
                            activity={conversation.activity}
                            live={conversation.status === "active"}
                          />
                        }
                        trailing={
                          <span className="font-mono text-2xs text-faint tabular">
                            {duration(conversation.effort.durationSeconds)}
                          </span>
                        }
                      >
                        {conversation.intent ?? "Incoming call"}
                        <span className="ml-2 font-mono text-2xs text-faint">
                          {conversation.fromLabel}
                        </span>
                      </Item>
                    ))}
                  </Group>
                )}

                {MODES.map((mode) => {
                  const items = mode.items.filter((item) =>
                    hasCapability(capabilities, item.capability),
                  );
                  if (items.length === 0) return null;

                  return (
                    <Group key={mode.id} heading={`Go to · ${mode.label}`}>
                      {items.map((item) => {
                        const label = resolveNavLabel(
                          item.id,
                          resolveLabel(item.label, lexicon),
                          domainPack,
                        );
                        const Icon = item.icon;
                        return (
                          <Item
                            key={item.id}
                            value={`${mode.label} ${label}`}
                            onSelect={() => go(item.href)}
                            icon={
                              <Icon className="size-4 text-faint" aria-hidden />
                            }
                            trailing={
                              item.chord ? <Kbd>g {item.chord}</Kbd> : undefined
                            }
                          >
                            {label}
                          </Item>
                        );
                      })}
                    </Group>
                  );
                })}

                {locations.length > 1 && (
                  <Group heading={`Switch ${lexicon.location.one.toLowerCase()}`}>
                    <Item
                      value={`all ${lexicon.location.many}`}
                      onSelect={() => run(() => setLocation(null))}
                    >
                      All {lexicon.location.many.toLowerCase()}
                    </Item>
                    {locations.map((location) => (
                      <Item
                        key={location.id}
                        value={`location ${location.name} ${location.code}`}
                        onSelect={() => run(() => setLocation(location.id))}
                        trailing={
                          <span className="font-mono text-2xs text-faint">
                            {location.code}
                          </span>
                        }
                      >
                        {location.name}
                      </Item>
                    ))}
                  </Group>
                )}

                <Group heading="Preferences">
                  <Item
                    value="theme dark light appearance"
                    onSelect={() =>
                      run(() =>
                        preferences.set(
                          "theme",
                          preferences.theme === "dark" ? "light" : "dark",
                        ),
                      )
                    }
                    icon={
                      preferences.theme === "dark" ? (
                        <Sun className="size-4 text-faint" aria-hidden />
                      ) : (
                        <Moon className="size-4 text-faint" aria-hidden />
                      )
                    }
                  >
                    Switch to {preferences.theme === "dark" ? "light" : "dark"}{" "}
                    theme
                  </Item>

                  <Item
                    value="density compact comfortable rows"
                    onSelect={() =>
                      run(() =>
                        preferences.set(
                          "density",
                          preferences.density === "compact"
                            ? "comfortable"
                            : "compact",
                        ),
                      )
                    }
                    icon={<Rows3 className="size-4 text-faint" aria-hidden />}
                  >
                    Use{" "}
                    {preferences.density === "compact"
                      ? "comfortable"
                      : "compact"}{" "}
                    density
                  </Item>

                  <Item
                    value="sidebar collapse expand"
                    onSelect={() =>
                      run(() =>
                        preferences.set(
                          "sidebarCollapsed",
                          !preferences.sidebarCollapsed,
                        ),
                      )
                    }
                    icon={
                      <PanelLeft className="size-4 text-faint" aria-hidden />
                    }
                  >
                    {preferences.sidebarCollapsed ? "Expand" : "Collapse"}{" "}
                    sidebar
                  </Item>

                  <Item
                    value="sound audio alerts mute"
                    onSelect={() =>
                      run(() =>
                        preferences.setSoundEnabled(!preferences.sound.enabled),
                      )
                    }
                    icon={
                      preferences.sound.enabled ? (
                        <VolumeX className="size-4 text-faint" aria-hidden />
                      ) : (
                        <Volume2 className="size-4 text-faint" aria-hidden />
                      )
                    }
                  >
                    {preferences.sound.enabled ? "Mute" : "Enable"} alert sounds
                  </Item>

                  <Item
                    value="interface sounds click press feedback tactile"
                    onSelect={() =>
                      run(() =>
                        preferences.setInterfaceSoundEnabled(
                          !preferences.sound.interfaceEnabled,
                        ),
                      )
                    }
                    icon={
                      preferences.sound.interfaceEnabled ? (
                        <VolumeX className="size-4 text-faint" aria-hidden />
                      ) : (
                        <Volume2 className="size-4 text-faint" aria-hidden />
                      )
                    }
                  >
                    {preferences.sound.interfaceEnabled ? "Mute" : "Enable"}{" "}
                    interface sounds
                  </Item>

                  <Item
                    value="high contrast accessibility"
                    onSelect={() =>
                      run(() =>
                        preferences.set(
                          "highContrast",
                          !preferences.highContrast,
                        ),
                      )
                    }
                    icon={<Contrast className="size-4 text-faint" aria-hidden />}
                  >
                    {preferences.highContrast ? "Turn off" : "Turn on"} high
                    contrast
                  </Item>

                  <Item
                    value="reduced sensory motion calm"
                    onSelect={() =>
                      run(() =>
                        preferences.set(
                          "reducedSensory",
                          !preferences.reducedSensory,
                        ),
                      )
                    }
                    icon={<Waves className="size-4 text-faint" aria-hidden />}
                  >
                    {preferences.reducedSensory ? "Turn off" : "Turn on"} reduced
                    sensory mode
                  </Item>

                  <Item
                    value="sign out log out account"
                    onSelect={() =>
                      run(() => {
                        authService
                          .logout()
                          .catch(() => {})
                          .finally(() => {
                            signOut();
                            router.push("/login");
                          });
                      })
                    }
                    icon={<LogOut className="size-4 text-faint" aria-hidden />}
                  >
                    Sign out
                  </Item>
                </Group>
              </Command.List>
            </Command>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Group({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <Command.Group
      heading={heading}
      className={cn(
        "mb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5",
        "[&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium",
        "[&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-faint",
        "[&_[cmdk-group-heading]]:uppercase",
      )}
    >
      {children}
    </Command.Group>
  );
}

function Item({
  value,
  onSelect,
  icon,
  trailing,
  children,
}: {
  value: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      // cmdk resolves Enter itself without a click, so the keyboard path is
      // announced here rather than left to the tactile layer.
      onSelect={() => {
        tactile("select");
        onSelect();
      }}
      className={cn(
        "flex h-9 cursor-pointer items-center gap-2.5 rounded-control px-2.5",
        "text-sm text-ink outline-none",
        "data-[selected=true]:bg-accent-surface",
      )}
    >
      {icon ?? <span className="size-4" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </Command.Item>
  );
}

/**
 * The global keyboard layer.
 *
 * Chords follow the convention operators already know from Linear: `g` then a
 * letter to go somewhere, ⌘K for everything else. Typing in an input never
 * triggers a shortcut.
 */
export function KeyboardLayer() {
  const router = useRouter();
  const toggle = usePalette((s) => s.toggle);
  const paletteOpen = usePalette((s) => s.isOpen);
  const { user } = useWorkspace();
  const capabilities = useMemo(() => user?.capabilities ?? [], [user]);

  useEffect(() => {
    let awaitingChord = false;
    let chordTimer: ReturnType<typeof setTimeout> | undefined;

    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggle();
        return;
      }

      if (paletteOpen || isTypingTarget(event.target)) return;

      // ⌘1/2/3 jump between the modes this user has, landing on the first
      // section they can actually open.
      if (mod && ["1", "2", "3"].includes(event.key)) {
        event.preventDefault();
        const modes = accessibleModes(capabilities);
        const mode = modes[Number(event.key) - 1];
        if (mode) {
          const landing = accessibleItems(mode, capabilities)[0];
          if (landing) router.push(landing.href);
        }
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (awaitingChord) {
        awaitingChord = false;
        clearTimeout(chordTimer);
        const match = accessibleModes(capabilities)
          .flatMap((mode) => accessibleItems(mode, capabilities))
          .find((item) => item.chord === event.key.toLowerCase());
        if (match) {
          event.preventDefault();
          router.push(match.href);
        }
        return;
      }

      if (event.key.toLowerCase() === "g") {
        awaitingChord = true;
        // The chord lapses rather than sticking, so a stray `g` does not
        // swallow the next keystroke.
        chordTimer = setTimeout(() => {
          awaitingChord = false;
        }, 1200);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(chordTimer);
    };
  }, [router, toggle, paletteOpen, capabilities]);

  return null;
}
