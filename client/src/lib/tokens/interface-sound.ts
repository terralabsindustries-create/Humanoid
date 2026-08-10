/**
 * Interface sound tokens.
 *
 * These are NOT the alert sounds in `sound.ts`. Alerts tell you something
 * happened while you were looking elsewhere. These tell you the control you
 * just pressed received the press — they are feedback, not information, and
 * they carry no meaning a person could miss by having them off.
 *
 * Which is why they are off by default and why they exist at all only on
 * genuine controls. Ordinary clicks on the page, text selection, scrolling and
 * hover stay silent: a product where everything ticks is a product where the
 * tick means nothing, and this one is used in rooms where live calls are being
 * monitored.
 *
 * Design of the tone itself. A bare sine beep reads as cheap. What reads as
 * premium is a physical one: a 1ms attack, a short pitched body that decays
 * exponentially, a quieter high partial on top for the transient "tick", and a
 * lowpass so nothing is brittle. Total length stays under 60ms — past that it
 * stops being a click and starts being a note.
 */

export type InterfaceSound =
  | "tap"
  | "commit"
  | "select"
  | "toggleOn"
  | "toggleOff"
  | "open"
  | "close";

export type ClickSpec = {
  /** Body pitch in Hz. */
  from: number;
  /** Glides to this pitch across the body. Omit for a static pitch. */
  to?: number;
  /** Total duration in seconds. Under 0.06 or it reads as a note, not a click. */
  length: number;
  /** Peak gain before user volume. Deliberately tiny — this sits under speech. */
  gain: number;
  type: OscillatorType;
  /** The transient on top: pitch multiple, and gain relative to the body. */
  tick?: { ratio: number; gain: number };
  /** Lowpass cutoff in Hz. Keeps the transient from turning brittle. */
  cutoff: number;
};

export const CLICKS: Record<InterfaceSound, ClickSpec> = {
  // The default press. Quietest thing in the product by a wide margin.
  tap: {
    from: 1180,
    to: 980,
    length: 0.034,
    gain: 0.028,
    type: "sine",
    tick: { ratio: 3.1, gain: 0.32 },
    cutoff: 5200,
  },
  // A primary or destructive action was submitted. Fuller and a touch lower —
  // weight is what makes an action feel like it landed.
  commit: {
    from: 760,
    to: 620,
    length: 0.052,
    gain: 0.042,
    type: "triangle",
    tick: { ratio: 2.6, gain: 0.28 },
    cutoff: 4200,
  },
  // Moving through a menu, a command palette, a tab, a row.
  select: {
    from: 1420,
    to: 1320,
    length: 0.028,
    gain: 0.024,
    type: "sine",
    tick: { ratio: 2.9, gain: 0.3 },
    cutoff: 6000,
  },
  // A pair. Rising for on, falling for off — the direction is the whole point.
  toggleOn: {
    from: 880,
    to: 1240,
    length: 0.042,
    gain: 0.03,
    type: "sine",
    tick: { ratio: 2.4, gain: 0.22 },
    cutoff: 5000,
  },
  toggleOff: {
    from: 1180,
    to: 820,
    length: 0.042,
    gain: 0.03,
    type: "sine",
    tick: { ratio: 2.4, gain: 0.22 },
    cutoff: 5000,
  },
  // Surfaces arriving and leaving: command palette, dialog, drawer.
  open: {
    from: 620,
    to: 1040,
    length: 0.056,
    gain: 0.03,
    type: "sine",
    cutoff: 4600,
  },
  close: {
    from: 1040,
    to: 620,
    length: 0.05,
    gain: 0.026,
    type: "sine",
    cutoff: 4600,
  },
};

/**
 * Haptic durations in milliseconds, for touch devices that support vibration.
 * Sound is optional; this is the part that survives a silenced phone, so it
 * stays on by default. Values are short enough to read as a tick rather than
 * a buzz.
 */
export const HAPTICS: Record<InterfaceSound, number> = {
  tap: 6,
  commit: 12,
  select: 7,
  toggleOn: 9,
  toggleOff: 9,
  open: 8,
  close: 5,
};

export const INTERFACE_SOUND_LABELS: Record<InterfaceSound, string> = {
  tap: "Press",
  commit: "Primary action",
  select: "Selection",
  toggleOn: "Toggle on",
  toggleOff: "Toggle off",
  open: "Surface opened",
  close: "Surface closed",
};
