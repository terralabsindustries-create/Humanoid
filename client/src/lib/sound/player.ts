"use client";

import { audioContext } from "@/lib/sound/context";
import {
  SOUNDS,
  type SoundEvent,
  type SoundPreferences,
} from "@/lib/tokens/sound";

/**
 * Synthesised alert playback.
 *
 * Press feedback is a separate family with different rules — see
 * sound/interface.ts. This module is only for events that happened without
 * the user asking.
 */

const lastPlayed = new Map<SoundEvent, number>();

/** Non-priority events are throttled so a burst of activity doesn't chatter. */
const THROTTLE_MS = 2000;

export function playSound(event: SoundEvent, prefs: SoundPreferences): void {
  if (!prefs.enabled || prefs.muted[event]) return;

  const spec = SOUNDS[event];
  const now = Date.now();

  if (!spec.priority) {
    const last = lastPlayed.get(event);
    if (last && now - last < THROTTLE_MS) return;
  }
  lastPlayed.set(event, now);

  const audio = audioContext();
  if (!audio) return;

  const startAt = audio.currentTime;

  spec.notes.forEach((frequency, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = spec.type;
    osc.frequency.value = frequency;

    const noteStart = startAt + index * spec.step;
    const noteEnd = noteStart + spec.step * 1.9;
    const peak = spec.gain * prefs.volume;

    // Short attack, exponential decay. A linear fade reads as a click.
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(peak, noteStart + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(noteStart);
    osc.stop(noteEnd + 0.02);
  });
}

/** Used by the Settings preview button so users can hear before enabling. */
export function previewSound(event: SoundEvent, volume: number): void {
  lastPlayed.delete(event);
  playSound(event, {
    enabled: true,
    interfaceEnabled: false,
    volume,
    muted: {},
  });
}
