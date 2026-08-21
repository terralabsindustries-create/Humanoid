/**
 * Twilio ConversationRelay's WebSocket protocol, as types.
 *
 * Twilio holds one socket open for the duration of a call. It owns speech
 * recognition and text-to-speech at both ends; what crosses this wire is JSON
 * *text*, never audio. That is the whole reason this backend needs no TTS SDK
 * and no ElevenLabs key — we hand Twilio words and it speaks them in the voice
 * the `<ConversationRelay>` noun selected.
 *
 * Every inbound field is optional. This is an external boundary whose shape we
 * do not control, and Twilio adds fields over time; a parser that insists on a
 * closed shape would start rejecting valid traffic the first time it does.
 */

/** Sent once, immediately after Twilio opens the socket. */
export type RelaySetup = {
  type: "setup";
  sessionId?: string;
  callSid?: string;
  parentCallSid?: string | null;
  from?: string;
  to?: string;
  direction?: string;
  callStatus?: string;
  accountSid?: string;
  /** `<Parameter>` children of the `<ConversationRelay>` noun. */
  customParameters?: Record<string, string>;
};

/**
 * One caller utterance. `last: false` arrives only when `partialPrompts` is
 * enabled on the noun — this backend acts on finalized prompts, so partials
 * are used for nothing but the barge-in signal Twilio also sends separately.
 */
export type RelayPrompt = {
  type: "prompt";
  voicePrompt?: string;
  lang?: string;
  last?: boolean;
};

/**
 * The caller talked over the agent. `utteranceUntilInterrupt` is the part of
 * our reply that actually reached their ear — the rest was discarded by Twilio
 * and must never be treated as spoken.
 */
export type RelayInterrupt = {
  type: "interrupt";
  utteranceUntilInterrupt?: string;
  durationUntilInterruptMs?: number;
};

export type RelayDtmf = { type: "dtmf"; digit?: string };

export type RelayError = { type: "error"; description?: string };

export type RelayInbound = RelaySetup | RelayPrompt | RelayInterrupt | RelayDtmf | RelayError;

/**
 * Outbound frames. A reply is a run of `text` frames terminated by one with
 * `last: true` — that terminator is how ConversationRelay learns the turn is
 * finished and it may hand the floor back to the caller.
 */
export type RelayOutbound =
  | { type: "text"; token: string; last: boolean; preemptible?: boolean }
  | { type: "end"; handoffData?: string };

const INBOUND_TYPES = new Set(["setup", "prompt", "interrupt", "dtmf", "error"]);

/** Returns null for anything unparseable or of an unrecognised type. */
export function parseRelayMessage(raw: string): RelayInbound | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const message = parsed as { type?: unknown };
  if (typeof message.type !== "string" || !INBOUND_TYPES.has(message.type)) return null;

  return parsed as RelayInbound;
}

export function serializeRelayMessage(message: RelayOutbound): string {
  return JSON.stringify(message);
}
