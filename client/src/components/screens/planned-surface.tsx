"use client";

import { usePathname } from "next/navigation";
import { SCREENS } from "@/lib/screen-registry";

/**
 * Placeholder for a surface that is specified but not yet built.
 *
 * The rule this exists to satisfy: no dead links, and no controls that pretend
 * to work. A destination in the navigation must lead somewhere that tells the
 * truth — what this screen is for, what decision it will support, and when it
 * lands. That makes the shell a navigable specification during the build rather
 * than a demo with holes in it.
 */
export function PlannedSurface({ title }: { title: string }) {
  const pathname = usePathname();
  const spec = SCREENS[pathname];

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="font-mono text-2xs tracking-wide text-faint uppercase">
        {spec?.phase ?? "Scheduled"} · not built yet
      </p>

      <h1 className="mt-2 font-display text-3xl text-ink">{title}</h1>

      {spec ? (
        <>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            {spec.purpose}
          </p>
          <div className="mt-8 border-t border-line pt-5">
            <p className="font-mono text-2xs tracking-wide text-faint uppercase">
              What you will do here
            </p>
            <p className="mt-2 text-md text-ink">{spec.primaryAction}</p>
          </div>
        </>
      ) : (
        <p className="mt-5 text-lg text-muted">
          This surface has no entry in the screen registry, which means it was
          linked before it was specified. That is a bug worth fixing.
        </p>
      )}

      <p className="mt-8 text-sm text-faint">
        The shell, tokens, lexicon and data layer around this page are real. The
        surface itself is deliberately empty rather than mocked, so nothing here
        can be mistaken for working software.
      </p>
    </div>
  );
}
