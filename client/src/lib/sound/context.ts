"use client";

/**
 * The shared AudioContext.
 *
 * One context for the whole app. Browsers cap how many a page may create, and
 * a context constructed before a user gesture starts suspended and logs a
 * warning on every load — so this is created lazily, inside the handler for
 * whatever gesture first needs sound.
 */

let ctx: AudioContext | null = null;

export function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) {
    // Safari suspends on tab blur; resume rather than rebuild.
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;

  ctx = new Ctor();
  return ctx;
}
