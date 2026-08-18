"use client";

import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useLexicon } from "@/components/providers/app-providers";
import { withArticle } from "@/lib/lexicon";

/**
 * Simulation chrome — arch §8.
 *
 * The rule it exists to enforce: a person must never mistake a simulation for a
 * live customer, or a live customer for a simulation. Both directions are
 * dangerous. Reading a simulated transcript as real gets a caller chased about a
 * conversation nobody had; reading a real one as simulated gets a distressed
 * caller ignored because someone assumed the machine was talking to itself.
 *
 * A badge in a corner does not carry that. Three things do, together, and they
 * are separated on purpose so no single failure removes the signal:
 *
 * - **Tone.** The whole surface sits on the inset background rather than the app
 *   background. Peripheral, and enough to make the screen feel unlike every
 *   other one before anything is read.
 * - **A hatched edge.** Drawn from a line token, never a hue. Simulation is not
 *   an operational state and must not borrow the meaning of one — least of all
 *   the reserved `ai`/`human` hues, which answer who is holding a call. A stripe
 *   also survives greyscale, colour blindness, and a glance across a room, which
 *   is the same reason rule 3 forbids colour as the only channel for status.
 * - **A persistent label.** Sticky, so it is on screen at every scroll position
 *   rather than only at the top. It says what this is *and* what follows from
 *   that — "nothing here reaches a customer" is the operational consequence,
 *   and it is the part that actually prevents the mistake.
 *
 * Deliberately not a modal or a separate route shell: the Simulator lives in the
 * ordinary app frame with the ordinary navigation, because it is a normal part
 * of building rather than a mode you get trapped in.
 */
export function SimulationSurface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label="Simulation"
      className={cn("relative isolate min-h-full bg-inset", className)}
    >
      {/*
       * Inset rather than absolute-positioned on the left edge alone: the hatch
       * runs the full height of the content, however far it scrolls, because the
       * signal has to hold at the bottom of a long page too.
       */}
      <span
        aria-hidden
        className="simulation-hatch pointer-events-none absolute inset-y-0 left-0 w-1.5"
      />
      <div className="pl-1.5">
        <SimulationLabel />
        {children}
      </div>
    </section>
  );
}

/**
 * The label is `sticky` against the scroll container, which is `<main>` in the
 * app shell — not the window. It is the one piece of this that must never be
 * scrolled away from.
 */
function SimulationLabel() {
  const lexicon = useLexicon();

  return (
    <div className="sticky top-0 z-20 border-b border-line bg-inset/95 backdrop-blur-sm">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-5 py-2.5 sm:px-8 xl:px-10">
        <span className="flex items-center gap-1.5 font-mono text-2xs tracking-wide text-ink uppercase">
          <FlaskConical className="size-3 text-faint" aria-hidden />
          Simulation
        </span>
        {/*
         * The party term comes from the lexicon like every other domain noun:
         * "reaches a customer" is the wrong sentence in a clinic, and this is
         * the one line on the surface that must land unambiguously.
         */}
        <span className="text-xs text-muted">
          Nothing on this screen reaches {withArticle(lexicon.party.one)}. No
          number is dialled and no record is changed.
        </span>
      </div>
    </div>
  );
}
