import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import twilio from "twilio";
import { env } from "@/config/env.js";
import { publicOrigin, verifyTwilioRequest, type TwilioVoicePayload } from "@/modules/telephony/twilio-request.js";
import {
  createCallRecord,
  endConversation,
  greetingFor,
  isAiReceptionistEnabled,
  recordCallerTurn,
  replyTo,
  resolveAiEmployee,
  startConversation,
  type ResolvedEmployee,
} from "@/modules/telephony/ai-receptionist.js";
import { activeModel } from "@/modules/telephony/llm.js";
import { VOICE_RELAY_PATH } from "@/modules/telephony/conversation-relay.js";
import { mintVoiceToken } from "@/modules/telephony/voice-token.js";

type VoiceResponse = InstanceType<typeof twilio.twiml.VoiceResponse>;
/** The SDK narrows this to a literal union of BCP-47 tags; ours comes from env. */
type GatherLanguage = NonNullable<Parameters<VoiceResponse["gather"]>[0]>["language"];

/**
 * Absolute mount path, i.e. including the `/api/v1` prefix `app.ts` registers
 * this module under. Spelled out rather than derived because it is also the
 * value pasted into the Twilio Console, and because the `<Gather action>` URL
 * must be absolute for signature validation to reconstruct it.
 */
const VOICE_WEBHOOK_BASE = "/api/v1/twilio/voice";

/** Stops a forgotten call from looping on Twilio's dime. */
const MAX_TURNS = 25;
/** Consecutive silent gathers before hanging up. */
const MAX_MISSES = 2;

/**
 * Silences Fastify's automatic per-request info logs for these two routes.
 * A call generates a webhook per turn, and that chatter buries the
 * transcription blocks this test exists to read. Warnings and errors — the
 * rejected-signature lines included — still come through.
 */
const routeOptions = { preHandler: verifyTwilioRequest, logLevel: "warn" } as const;

export function registerTwilioVoiceRoutes(app: FastifyInstance): void {
  // Twilio answers here. Prompt, beep, then listen.
  // GET as well as POST: Twilio can be configured either way, its console
  // probes the URL, and a POST-only route makes a perfectly healthy webhook
  // look dead to anything that just opens the link.
  app.route({
    method: ["GET", "POST"],
    url: "/twilio/voice/incoming",
    ...routeOptions,
    handler: async (request, reply) => {
    const payload = readPayload(request);
    const response = new twilio.twiml.VoiceResponse();

    // Resolved even without a model configured: a transcription-only call is
    // still a real call and belongs in the record.
    const employee = await resolveAiEmployee();

    printBlock("[Twilio] Incoming call", [
      ["CallSid", payload.CallSid],
      ["From", payload.From],
      ["To", payload.To],
      [
        "Answered by",
        employee
          ? `${employee.employeeName} — ${employee.businessName}  [${activeModel()}]` +
            (useConversationRelay() ? `  via ConversationRelay / ${env.TWILIO_TTS_PROVIDER}` : "  via <Gather>")
          : isAiReceptionistEnabled()
            ? "transcription probe — no configured AI employee found"
            : "transcription probe — no model configured (set a provider key)",
      ],
    ]);

    if (employee && payload.CallSid && useConversationRelay()) {
      await connectConversationRelay(response, request, employee, payload.CallSid, {
        from: payload.From ?? "unknown",
        to: payload.To ?? "unknown",
      });
    } else if (employee && payload.CallSid) {
      await startConversation(payload.CallSid, employee, {
        from: payload.From ?? "unknown",
        to: payload.To ?? "unknown",
      });
      // Greeting is built locally rather than generated, so the caller hears
      // something the instant they connect instead of waiting on a model.
      appendSpeechGather(response, request, { turn: 1, misses: 0 }).say(greetingFor(employee));
    } else {
      response.say("Hi. Please say something after the tone.");
      response.play({ digits: "1" });
      appendSpeechGather(response, request, { turn: 1, misses: 0 });
    }

      return sendTwiml(reply, response);
    },
  });

  // Twilio sends the transcription here, one request per gather.
  app.route({
    method: ["GET", "POST"],
    url: "/twilio/voice/speech",
    ...routeOptions,
    handler: async (request, reply) => {
    const payload = readPayload(request);
    const query = request.query as Record<string, string | undefined>;
    const turn = readCount(query.turn, 1);
    const misses = readCount(query.misses, 0);

    const text = payload.SpeechResult?.trim() ?? "";
    const response = new twilio.twiml.VoiceResponse();

    if (text.length === 0) {
      // Reached because the gather sets actionOnEmptyResult — without it a
      // silent caller would fall through and the call would just end.
      printBlock(`[Twilio] No speech detected  (turn ${turn})`, [
        ["CallSid", payload.CallSid],
        ["Caller", payload.From],
      ]);

      if (misses + 1 >= MAX_MISSES) {
        response.say("I did not catch anything. Goodbye.");
        response.hangup();
        if (payload.CallSid) await endConversation(payload.CallSid, "no_speech");
        return sendTwiml(reply, response);
      }

      response.say("Sorry, I did not catch that. Please try again.");
      appendSpeechGather(response, request, { turn: turn + 1, misses: misses + 1 });
      return sendTwiml(reply, response);
    }

    printBlock(`[Twilio] Speech recognized  (turn ${turn})`, [
      ["CallSid", payload.CallSid],
      ["Caller", payload.From],
      ["Text", `"${text}"`],
      ["Confidence", formatConfidence(payload.Confidence)],
    ]);

    if (payload.CallSid) {
      const confidence = Number.parseFloat(payload.Confidence ?? "");
      await recordCallerTurn(payload.CallSid, text, Number.isFinite(confidence) ? confidence : null);
    }

    if (turn >= MAX_TURNS) {
      response.say("I have to go now. Thanks for calling. Goodbye.");
      response.hangup();
      if (payload.CallSid) await endConversation(payload.CallSid, "turn_limit");
      return sendTwiml(reply, response);
    }

    if (isAiReceptionistEnabled() && payload.CallSid) {
      const startedAt = Date.now();
      const result = await replyTo(payload.CallSid, text);

      printBlock(`[AI] Reply  (turn ${turn}, ${Date.now() - startedAt}ms, ${result.reason})`, [
        ["Text", `"${result.text}"`],
      ]);

      appendSpeechGather(response, request, { turn: turn + 1, misses: 0 }).say(result.text);
      return sendTwiml(reply, response);
    }

      // No AI employee configured — stay the transcription probe.
      response.say("Got it. Go ahead.");
      appendSpeechGather(response, request, { turn: turn + 1, misses: 0 });
      return sendTwiml(reply, response);
    },
  });
}

/**
 * The realtime path needs both an employee to be and a model to think with.
 * Without either, `<Gather>` still transcribes, which is the more useful
 * degradation than a socket that connects and says nothing.
 */
function useConversationRelay(): boolean {
  return env.VOICE_RELAY_ENABLED && isAiReceptionistEnabled();
}

/**
 * Hands the call to Twilio ConversationRelay: one WebSocket for the whole
 * call, with Twilio running speech recognition and ElevenLabs synthesis at its
 * own end.
 *
 * The socket URL carries a signed token minted here rather than being
 * guessable, because this webhook is the last point at which Twilio's own
 * signature proves the request is genuine — see `voice-token.ts`.
 */
async function connectConversationRelay(
  response: VoiceResponse,
  request: FastifyRequest,
  employee: ResolvedEmployee,
  callSid: string,
  context: { from: string; to: string },
): Promise<void> {
  const conversationId = await createCallRecord(callSid, employee, context);

  const token = mintVoiceToken({
    callSid,
    workspaceId: employee.workspaceId,
    employeeId: employee.employeeId,
    conversationId,
  });

  const socketUrl = `${websocketOrigin(request)}/api/v1${VOICE_RELAY_PATH}?t=${encodeURIComponent(token)}`;
  const voice = resolveVoice();

  const relay = response.connect().conversationRelay({
    url: socketUrl,
    // Spoken by Twilio the instant the socket is up, with no round trip
    // through this backend or the model — the caller hears a human-sounding
    // sentence before any of our machinery has had to do anything.
    welcomeGreeting: greetingFor(employee),
    ttsProvider: env.TWILIO_TTS_PROVIDER,
    ...(voice ? { voice } : {}),
    ...(env.TWILIO_TRANSCRIPTION_PROVIDER
      ? { transcriptionProvider: env.TWILIO_TRANSCRIPTION_PROVIDER }
      : {}),
    ...(env.TWILIO_SPEECH_MODEL ? { speechModel: env.TWILIO_SPEECH_MODEL } : {}),
    language: env.TWILIO_SPEECH_LANGUAGE,
    // Barge-in. Without this the caller has to sit through every sentence the
    // agent starts, which is the single thing that makes a voice agent feel
    // like an IVR rather than a conversation.
    interruptible: "true",
    interruptSensitivity: env.VOICE_RELAY_INTERRUPT_SENSITIVITY,
    welcomeGreetingInterruptible: "true",
  });

  // Carried as a TwiML parameter as well as in the URL: it arrives back in the
  // `setup` message, which is where a future move off query-string tokens
  // would read it from.
  relay.parameter({ name: "callSid", value: callSid });
}

/**
 * ConversationRelay only dials `wss://`. Derived from the same origin the
 * webhook signature was validated against so both agree on the host.
 */
function websocketOrigin(request: FastifyRequest): string {
  return publicOrigin(request).replace(/^http/, "ws");
}

/**
 * The `voice` attribute ConversationRelay expects: for ElevenLabs a voice id,
 * suffixed with `-<modelId>` when a model is pinned. Blank omits the attribute
 * entirely, which is not the same as sending an empty one — Twilio then picks
 * the provider's own default rather than failing to resolve a nameless voice.
 *
 * Deployment-wide today. It takes no tenant argument because `AiEmployee` has
 * no voice column yet; when it gains one, this is the only place that changes,
 * and every caller already has the employee to hand.
 */
function resolveVoice(): string | undefined {
  const voiceId = env.ELEVENLABS_VOICE_ID;
  if (!voiceId) return undefined;
  return env.ELEVENLABS_MODEL_ID ? `${voiceId}-${env.ELEVENLABS_MODEL_ID}` : voiceId;
}

/**
 * Returns the `<Gather>` so callers can nest a `<Say>` inside it — one TwiML
 * document that speaks and then listens, rather than a separate prompt verb.
 */
function appendSpeechGather(
  response: VoiceResponse,
  request: FastifyRequest,
  next: { turn: number; misses: number },
): ReturnType<VoiceResponse["gather"]> {
  const action = `${publicOrigin(request)}${VOICE_WEBHOOK_BASE}/speech?turn=${next.turn}&misses=${next.misses}`;

  return response.gather({
    input: ["speech"],
    action,
    method: "POST",
    // Let Twilio decide when the caller stopped talking rather than cutting
    // a natural phrase off at a fixed timeout.
    speechTimeout: "auto",
    speechModel: "phone_call",
    language: env.TWILIO_SPEECH_LANGUAGE as GatherLanguage,
    // Report exactly what was said; this is a transcription test.
    profanityFilter: false,
    // Always call `action`, even on silence, so timeouts are handled here.
    actionOnEmptyResult: true,
  });
}

function sendTwiml(reply: FastifyReply, response: VoiceResponse): FastifyReply {
  return reply.code(200).type("text/xml").send(response.toString());
}

function readPayload(request: FastifyRequest): TwilioVoicePayload {
  return request.body ?? {};
}

function readCount(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function formatConfidence(raw: string | undefined): string {
  const value = Number.parseFloat(raw ?? "");
  return Number.isFinite(value) ? value.toFixed(2) : "n/a";
}

/**
 * Written straight to stdout rather than through the pino logger: this is the
 * deliverable of the speech test and needs to be readable at a glance, which
 * a single-line structured log record is not.
 */
function printBlock(heading: string, fields: [string, string | undefined][]): void {
  const lines = fields.map(([label, value]) => `${label}: ${value ?? "unknown"}`);
  console.log(["", heading, ...lines, ""].join("\n"));
}
