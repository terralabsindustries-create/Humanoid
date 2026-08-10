"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Keyboard badge.
 *
 * Shortcuts are shown wherever they exist, not hidden in a help sheet. Modifier
 * glyphs are platform-correct: showing Ctrl to a Mac user reads as a bug.
 */
export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-4.5 min-w-4.5 items-center justify-center rounded px-1",
        "border border-line bg-subtle font-mono text-2xs text-faint",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function KbdGroup({
  keys,
  className,
}: {
  keys: string[];
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </span>
  );
}

/**
 * Platform-correct modifier glyph.
 *
 * Read through useSyncExternalStore rather than an effect: the server snapshot
 * renders the more common platform, React swaps it during hydration without a
 * mismatch warning, and there is no setState-in-effect cascade.
 */
const subscribeToNothing = () => () => {};

export function useModifierKey(): string {
  const isApplePlatform = useSyncExternalStore(
    subscribeToNothing,
    () => /Mac|iPhone|iPad|iPod/.test(navigator.userAgent),
    () => true,
  );
  return isApplePlatform ? "⌘" : "Ctrl";
}
