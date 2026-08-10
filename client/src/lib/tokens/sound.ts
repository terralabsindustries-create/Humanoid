/**
 * Sound tokens.
 *
 * Sound is optional, off until explicitly enabled, and never required to
 * understand what happened — every sound event has a visual equivalent.
 *
 * Tones are synthesised with the Web Audio API rather than shipped as assets:
 * no network cost, no licensing question, and the whole palette is tunable
 * from one place. The language is soft, short, warm and functional.
 *
 * Events are deliberately few. Sound marks moments that change what a person
 * should do next — a handoff arriving, an approval needed, a deployment
 * finishing. It never marks navigation, typing, hover, or streaming updates.
 */

export type SoundEvent =
  | "handoffReceived"
  | "approvalRequired"
  | "urgentAlert"
  | "deployComplete"
  | "testPassed"
  | "testFailed"
  | "connectionEstablished"
  | "connectionLost";

type ToneSpec = {
  /** Frequencies in Hz, played in sequence. */
  notes: number[];
  /** Seconds per note. */
  step: number;
  /** Peak gain, 0–1. Kept low; these play in quiet clinics and offices. */
  gain: number;
  type: OscillatorType;
  /** Priority events bypass the "recently played" throttle. */
  priority?: boolean;
};

/**
 * A warm, consonant palette. Rising intervals for things that arrived or
 * succeeded, falling for things that ended or failed, a repeated tone for
 * things that need a person.
 */
export const SOUNDS: Record<SoundEvent, ToneSpec> = {
  // Someone is waiting for you. Two rising notes, unmistakable but not shrill.
  handoffReceived: {
    notes: [587.33, 880.0],
    step: 0.11,
    gain: 0.16,
    type: "sine",
    priority: true,
  },
  // A decision is blocked on you. Same shape, one note, repeated.
  approvalRequired: {
    notes: [698.46, 698.46],
    step: 0.13,
    gain: 0.14,
    type: "sine",
    priority: true,
  },
  // Reserved for genuine urgency. The only sound with three notes.
  urgentAlert: {
    notes: [880.0, 659.25, 880.0],
    step: 0.1,
    gain: 0.2,
    type: "triangle",
    priority: true,
  },
  deployComplete: {
    notes: [523.25, 659.25, 783.99],
    step: 0.09,
    gain: 0.12,
    type: "sine",
  },
  testPassed: { notes: [659.25, 987.77], step: 0.08, gain: 0.1, type: "sine" },
  testFailed: { notes: [493.88, 369.99], step: 0.1, gain: 0.11, type: "sine" },
  connectionEstablished: {
    notes: [783.99],
    step: 0.07,
    gain: 0.08,
    type: "sine",
  },
  connectionLost: { notes: [392.0], step: 0.14, gain: 0.1, type: "sine" },
};

/** Human-readable labels for the per-event preference list in Settings. */
export const SOUND_LABELS: Record<SoundEvent, string> = {
  handoffReceived: "Handoff received",
  approvalRequired: "Approval required",
  urgentAlert: "Urgent alert",
  deployComplete: "Deployment complete",
  testPassed: "Test passed",
  testFailed: "Test failed",
  connectionEstablished: "Connection restored",
  connectionLost: "Connection lost",
};

export type SoundPreferences = {
  enabled: boolean;
  /**
   * Press feedback — the click when you operate a control. Separate switch
   * from `enabled` because the two answer different questions: alerts are
   * information you might miss, interface sound is texture you might want.
   * See tokens/interface-sound.ts.
   */
  interfaceEnabled: boolean;
  /** 0–1, applied on top of each tone's own gain. Shared by both families. */
  volume: number;
  /** Per-event opt-out. Absent key means enabled. */
  muted: Partial<Record<SoundEvent, boolean>>;
};

export const DEFAULT_SOUND_PREFERENCES: SoundPreferences = {
  // Off until the user turns it on. Browsers block autoplay before a gesture
  // anyway, and unexpected sound in a clinic is a real-world problem.
  enabled: false,
  // Off for the same reason, plus one of its own: operators run this product
  // while listening to live calls, and a click on every press competes with
  // the audio that is the actual work.
  interfaceEnabled: false,
  volume: 0.7,
  muted: {},
};
