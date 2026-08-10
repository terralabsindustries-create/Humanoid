"use client";

import { audioContext } from "@/lib/sound/context";
import {
  CLICKS,
  HAPTICS,
  type InterfaceSound,
} from "@/lib/tokens/interface-sound";

/**
 * Interface feedback playback: the click you hear and the tick you feel.
 *
 * Two rules govern everything here.
 *
 * 1. Never late. Feedback is played on press, not on release or on the result,
 *    and it is synthesised rather than loaded so there is no first-use delay.
 * 2. Never a machine gun. A held key, a double-click, or a component that
 *    fires both a pointer and a keyboard path must not stack into a rattle.
 */

/** Below this gap, a second click is the same press. */
const MIN_GAP_MS = 55;

let lastPlayedAt = 0;

/** Interface sound is suppressed outright while call audio is playing. */
let suppressed = false;

/**
 * Call with `true` while a recording, live listen-in or voice preview is
 * audible. Clicking over someone's voice is the one thing this feature must
 * never do, and the decision belongs to whatever owns the audio, not here.
 */
export function suppressInterfaceSound(value: boolean): void {
  suppressed = value;
}

type PlayOptions = {
  enabled: boolean;
  volume: number;
  haptics: boolean;
};

export function playInterfaceSound(
  kind: InterfaceSound,
  { enabled, volume, haptics }: PlayOptions,
): void {
  const now = Date.now();
  if (now - lastPlayedAt < MIN_GAP_MS) return;
  lastPlayedAt = now;

  if (haptics) vibrate(kind);
  if (!enabled || suppressed) return;

  const audio = audioContext();
  if (!audio) return;

  const spec = CLICKS[kind];
  const start = audio.currentTime;
  const end = start + spec.length;

  // A repeated press at an identical pitch reads as a sample on loop. A pitch
  // wobble under 2% is inaudible as pitch and reads as a physical object.
  const drift = 1 + (Math.random() - 0.5) * 0.03;

  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = spec.cutoff;
  filter.Q.value = 0.7;

  const out = audio.createGain();
  out.gain.value = Math.max(0, Math.min(1, volume));
  filter.connect(out);
  out.connect(audio.destination);

  const body = audio.createOscillator();
  body.type = spec.type;
  body.frequency.setValueAtTime(spec.from * drift, start);
  if (spec.to) {
    body.frequency.exponentialRampToValueAtTime(spec.to * drift, end);
  }

  const bodyGain = audio.createGain();
  // 1.2ms attack: fast enough to read as a transient, slow enough to avoid the
  // DC pop that a hard start produces.
  bodyGain.gain.setValueAtTime(0.0001, start);
  bodyGain.gain.exponentialRampToValueAtTime(spec.gain, start + 0.0012);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, end);

  body.connect(bodyGain);
  bodyGain.connect(filter);
  body.start(start);
  body.stop(end + 0.01);

  if (spec.tick) {
    const tick = audio.createOscillator();
    tick.type = "sine";
    tick.frequency.value = spec.from * spec.tick.ratio * drift;

    // The transient decays roughly three times faster than the body. That
    // ratio is what separates a click from a beep.
    const tickEnd = start + spec.length * 0.34;
    const tickGain = audio.createGain();
    tickGain.gain.setValueAtTime(0.0001, start);
    tickGain.gain.exponentialRampToValueAtTime(
      spec.gain * spec.tick.gain,
      start + 0.0008,
    );
    tickGain.gain.exponentialRampToValueAtTime(0.0001, tickEnd);

    tick.connect(tickGain);
    tickGain.connect(filter);
    tick.start(start);
    tick.stop(tickEnd + 0.01);
  }
}

/** Touch feedback. A no-op on desktop and on iOS, which has no vibrate API. */
function vibrate(kind: InterfaceSound): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  if (!window.matchMedia("(pointer: coarse)").matches) return;
  try {
    navigator.vibrate(HAPTICS[kind]);
  } catch {
    // Some browsers throw when the page is not visible. Feedback is optional.
  }
}

/** Used by Preferences so a person can hear a sound before enabling it. */
export function previewInterfaceSound(
  kind: InterfaceSound,
  volume: number,
): void {
  lastPlayedAt = 0;
  playInterfaceSound(kind, { enabled: true, volume, haptics: false });
}
