import type { Prisma } from "@prisma/client";
import { env } from "@/config/env.js";
import { buildSystemPrompt, type ResolvedEmployee } from "@/modules/telephony/ai-receptionist.js";
import { streamReply, type Turn } from "@/modules/telephony/llm.js";
import { TtsChunker } from "@/modules/telephony/tts-chunker.js";
import { endCall, recordTurn } from "@/modules/conversations/conversation.service.js";

/**
 * One live phone call, for the duration it is live.
 *
 * This is the part of the realtime pipeline that owns *time*. The relay socket
 * below it only moves JSON, and Postgres above it only remembers; what happens
 * here is the ordering problem — a caller can start a new sentence while the
 * model is still writing the answer to their last one, and every piece of
 * machinery downstream of that moment has to agree on which turn is real.
 *
 * The answer is a turn id. Each caller utterance increments it, and every
 * frame this module tries to speak is checked against the current one on its
 * way out. A superseded generation cannot reach the caller no matter where it
 * had got to — the model stream is aborted, but aborts are asynchronous and
 * the check is what actually makes it safe.
 *
 * Sessions are keyed by CallSid and hold a workspace resolved from a signed
 * token, never from anything the socket claimed. Nothing here is shared
 * between calls.
 */

/** How this session speaks. Abstracted so the turn logic is testable without a socket. */
export type VoiceSessionTransport = {
  /** One `text` frame. `last` closes the turn and hands the floor back. */
  sendText(token: string, last: boolean): void;
  /** Ask Twilio to end the call. */
  end(reason: string): void;
};

type ActiveTurn = {
  id: number;
  abort: AbortController;
  /** What we have actually handed to the synthesiser so far. */
  spoken: string;
  startedAt: number;
  firstTokenAt: number | null;
};

export type VoiceSession = {
  callSid: string;
  workspaceId: string;
  employeeId: string;
  conversationId: string | null;
  employee: ResolvedEmployee;
  systemPrompt: string;
  /** The model's working context. Postgres holds the durable transcript. */
  turns: Turn[];
  transport: VoiceSessionTransport;
  startedAt: number;
  turnCount: number;
  current: ActiveTurn | null;
  closed: boolean;
  /**
   * Serialises writes. `recordTurn` derives its sequence number from a count,
   * so two turns persisted concurrently can race for the same number and one
   * loses to the unique constraint. Chaining them also keeps the stored
   * transcript in the order the call actually happened.
   */
  writes: Promise<void>;
  latencies: number[];
};

const sessions = new Map<string, VoiceSession>();

/** Spoken when the model itself fails. Never leaks the reason to the caller. */
const MODEL_FAILURE_LINE = "I'm having trouble accessing that right now. Could you try again?";
const TURN_LIMIT_LINE = "I have to go now. Thanks for calling. Goodbye.";

export function getVoiceSession(callSid: string): VoiceSession | undefined {
  return sessions.get(callSid);
}

/** Live-session count. Exists so tests can assert cleanup actually happened. */
export function activeVoiceSessionCount(): number {
  return sessions.size;
}

export type OpenVoiceSessionInput = {
  callSid: string;
  workspaceId: string;
  employeeId: string;
  conversationId: string | null;
  employee: ResolvedEmployee;
  transport: VoiceSessionTransport;
};

export function openVoiceSession(input: OpenVoiceSessionInput): VoiceSession {
  // A reconnect for the same CallSid replaces the old session rather than
  // running two against one call.
  const existing = sessions.get(input.callSid);
  if (existing) discardActiveTurn(existing);

  const session: VoiceSession = {
    callSid: input.callSid,
    workspaceId: input.workspaceId,
    employeeId: input.employeeId,
    conversationId: input.conversationId,
    employee: input.employee,
    systemPrompt: buildSystemPrompt(input.employee),
    turns: [],
    transport: input.transport,
    startedAt: Date.now(),
    turnCount: 0,
    current: null,
    closed: false,
    writes: Promise.resolve(),
    latencies: [],
  };

  sessions.set(input.callSid, session);
  return session;
}

/**
 * The caller finished an utterance.
 *
 * Supersedes whatever the agent was saying: by the time a finalized transcript
 * arrives, anything still queued is an answer to a question that has moved on.
 */
export function handleCallerTurn(session: VoiceSession, text: string): void {
  if (session.closed) return;

  const spoken = text.trim();
  if (spoken.length === 0) return;

  // If the agent was mid-sentence and no explicit interrupt arrived, retire
  // that turn against what it had actually said before starting the next one.
  if (session.current) retireActiveTurn(session, null);

  session.turnCount += 1;
  logVoice(session, `caller transcript received (turn ${session.turnCount})`);

  persist(session, {
    speakerType: "customer",
    text: spoken,
    metadata: { transport: "conversation_relay" },
  });

  session.turns.push({ role: "user", text: spoken });

  if (session.turnCount >= env.VOICE_RELAY_MAX_TURNS) {
    speakAndEnd(session, TURN_LIMIT_LINE, "turn_limit");
    return;
  }

  const turn: ActiveTurn = {
    id: session.turnCount,
    abort: new AbortController(),
    spoken: "",
    startedAt: Date.now(),
    firstTokenAt: null,
  };
  session.current = turn;

  void runTurn(session, turn);
}

/**
 * The caller talked over the agent.
 *
 * `utteranceUntilInterrupt` is what reached their ear; everything after it was
 * discarded by Twilio and must not be recorded as spoken, or the transcript
 * would claim the agent said things nobody heard — and the model's own context
 * would inherit that lie on the next turn.
 */
export function handleInterrupt(session: VoiceSession, utteranceUntilInterrupt: string | undefined): void {
  if (session.closed || !session.current) return;
  logVoice(session, "caller interrupted");
  retireActiveTurn(session, utteranceUntilInterrupt ?? null);
}

/** Streams one reply. Never throws — a phone call cannot show a stack trace. */
async function runTurn(session: VoiceSession, turn: ActiveTurn): Promise<void> {
  const chunker = new TtsChunker();
  logVoice(session, `Groq generation started (turn ${turn.id})`);

  try {
    for await (const chunk of streamReply(session.systemPrompt, session.turns, turn.abort.signal)) {
      if (!isCurrent(session, turn)) return;

      if (chunk.kind === "end") {
        if (chunk.reason === "refusal") {
          finishTurn(session, turn, "Sorry, I can't help with that one. Is there something else I can do?");
          return;
        }
        continue;
      }

      if (turn.firstTokenAt === null) {
        turn.firstTokenAt = Date.now();
        logVoice(session, `first LLM token (turn ${turn.id}, ${turn.firstTokenAt - turn.startedAt}ms)`);
      }

      for (const frame of chunker.push(chunk.text)) {
        if (!emit(session, turn, frame)) return;
      }
    }
  } catch (error) {
    if (!isCurrent(session, turn)) return;
    console.error("[VOICE] model stream failed:", error instanceof Error ? error.message : error);
    finishTurn(session, turn, MODEL_FAILURE_LINE);
    return;
  }

  if (!isCurrent(session, turn)) return;

  for (const frame of chunker.flush()) {
    if (!emit(session, turn, frame)) return;
  }

  if (turn.spoken.trim().length === 0) {
    finishTurn(session, turn, "Sorry, I didn't catch that. Could you say it again?");
    return;
  }

  finishTurn(session, turn, null);
}

/**
 * Sends one frame if the turn still owns the floor. Returns false when the
 * turn has been superseded, which is the generator's signal to stop.
 */
function emit(session: VoiceSession, turn: ActiveTurn, frame: string): boolean {
  if (!isCurrent(session, turn)) return false;

  if (turn.spoken.length === 0) {
    logVoice(session, `first text frame sent to ConversationRelay (turn ${turn.id})`);
  }

  turn.spoken += frame;
  session.transport.sendText(frame, false);
  return true;
}

/**
 * Closes out a turn and hands the floor back.
 *
 * `fallbackLine` is appended rather than substituted, because a stream that
 * failed halfway has already put words in the caller's ear. Replacing the
 * transcript with the apology would record a turn that did not happen — the
 * same dishonesty barge-in handling is careful to avoid. When nothing was
 * spoken, appending is substitution anyway.
 */
function finishTurn(session: VoiceSession, turn: ActiveTurn, fallbackLine: string | null): void {
  if (!isCurrent(session, turn)) return;

  if (fallbackLine) {
    // Sent and recorded as the same string, separator included: the stored
    // transcript must be exactly what went down the phone, character for
    // character, or it stops being evidence of the call.
    const addition = turn.spoken.length > 0 ? ` ${fallbackLine}` : fallbackLine;
    turn.spoken += addition;
    session.transport.sendText(addition, false);
  }

  session.transport.sendText("", true);
  session.current = null;

  const spoken = turn.spoken.trim();
  if (spoken.length === 0) return;

  session.turns.push({ role: "assistant", text: spoken });
  if (turn.firstTokenAt !== null) session.latencies.push(turn.firstTokenAt - turn.startedAt);

  persist(session, {
    speakerType: "ai",
    text: spoken,
    latencyMs: Date.now() - turn.startedAt,
    metadata: {
      transport: "conversation_relay",
      ttsProvider: env.TWILIO_TTS_PROVIDER,
      ...(turn.firstTokenAt !== null ? { firstTokenMs: turn.firstTokenAt - turn.startedAt } : {}),
    },
  });
}

/**
 * Ends a turn early and records only what the caller actually heard. Aborting
 * the model stream is the cheap half; clearing `session.current` is the half
 * that makes every in-flight `emit` fail its check.
 */
function retireActiveTurn(session: VoiceSession, heard: string | null): void {
  const turn = session.current;
  if (!turn) return;

  session.current = null;
  turn.abort.abort();

  // Twilio's account of what played wins over ours: we know what we handed to
  // the synthesiser, it knows what came out of the speaker.
  const spoken = (heard ?? turn.spoken).trim();
  if (spoken.length === 0) return;

  session.turns.push({ role: "assistant", text: spoken });

  persist(session, {
    speakerType: "ai",
    text: spoken,
    latencyMs: Date.now() - turn.startedAt,
    metadata: {
      transport: "conversation_relay",
      ttsProvider: env.TWILIO_TTS_PROVIDER,
      interrupted: true,
    },
  });
}

/** Drops a turn without recording it — for a session being torn down. */
function discardActiveTurn(session: VoiceSession): void {
  const turn = session.current;
  if (!turn) return;
  session.current = null;
  turn.abort.abort();
}

function isCurrent(session: VoiceSession, turn: ActiveTurn): boolean {
  return !session.closed && session.current?.id === turn.id;
}

function speakAndEnd(session: VoiceSession, line: string, outcome: string): void {
  session.transport.sendText(line, false);
  session.transport.sendText("", true);
  session.transport.end(outcome);
}

/**
 * Queues a durable write. Failures are logged and swallowed: losing a line of
 * transcript is bad, dropping the call the caller is on is worse.
 */
function persist(
  session: VoiceSession,
  input: {
    speakerType: "customer" | "ai";
    text: string;
    latencyMs?: number;
    metadata?: Prisma.InputJsonObject;
  },
): void {
  const conversationId = session.conversationId;
  if (!conversationId) return;

  session.writes = session.writes.then(async () => {
    try {
      await recordTurn({
        conversationId,
        speakerType: input.speakerType,
        text: input.text,
        confidence: null,
        latencyMs: input.latencyMs ?? null,
        metadata: input.metadata,
      });
    } catch (error) {
      console.error("[VOICE] could not record turn:", error instanceof Error ? error.message : error);
    }
  });
}

/**
 * Tears the call down. Waits for queued writes so the last thing said still
 * lands, then finalises the conversation row.
 *
 * `outcomeCode`: completed | no_speech | turn_limit | caller_hung_up | error
 */
export async function closeVoiceSession(callSid: string, outcomeCode = "completed"): Promise<void> {
  const session = sessions.get(callSid);
  if (!session) return;

  sessions.delete(callSid);
  session.closed = true;
  discardActiveTurn(session);

  logVoice(session, `call ended (${outcomeCode}, ${Math.round((Date.now() - session.startedAt) / 1000)}s)`);

  const pending = session.writes;
  session.turns.length = 0;

  await pending;

  if (!session.conversationId) return;
  try {
    await endCall(session.conversationId, outcomeCode, {
      transport: "conversation_relay",
      ttsProvider: env.TWILIO_TTS_PROVIDER,
      turns: session.turnCount,
      ...(session.latencies.length > 0
        ? {
            firstTokenMsAvg: Math.round(
              session.latencies.reduce((sum, value) => sum + value, 0) / session.latencies.length,
            ),
            firstTokenMsMax: Math.max(...session.latencies),
          }
        : {}),
    });
  } catch (error) {
    console.error("[VOICE] could not finalise call:", error instanceof Error ? error.message : error);
  }
}

/**
 * Deliberately never interpolates transcript text. Call recordings are
 * sensitive enough without a copy of every sentence in the application log;
 * what a caller said belongs in the conversation row, which is access
 * controlled, and nowhere else.
 */
function logVoice(session: VoiceSession, message: string): void {
  console.log(`[VOICE] ${session.callSid} ${message}`);
}
