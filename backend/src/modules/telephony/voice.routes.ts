import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import twilio from "twilio";
import { env } from "@/config/env.js";
import { publicOrigin, verifyTwilioRequest, type TwilioVoicePayload } from "@/modules/telephony/twilio-request.js";

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
const MAX_TURNS = 10;
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
  app.post("/twilio/voice/incoming", routeOptions, (request, reply) => {
    const payload = readPayload(request);

    printBlock("[Twilio] Incoming call", [
      ["CallSid", payload.CallSid],
      ["From", payload.From],
      ["To", payload.To],
    ]);

    const response = new twilio.twiml.VoiceResponse();
    response.say("Hi. Please say something after the tone.");
    response.play({ digits: "1" });
    appendSpeechGather(response, request, { turn: 1, misses: 0 });

    return sendTwiml(reply, response);
  });

  // Twilio posts the transcription here, one request per gather.
  app.post("/twilio/voice/speech", routeOptions, (request, reply) => {
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

    if (turn >= MAX_TURNS) {
      response.say("That is all for this test. Goodbye.");
      response.hangup();
      return sendTwiml(reply, response);
    }

    // Keep the loop open so several phrases can be tested in one call.
    response.say("Got it. Go ahead.");
    appendSpeechGather(response, request, { turn: turn + 1, misses: 0 });
    return sendTwiml(reply, response);
  });
}

function appendSpeechGather(
  response: VoiceResponse,
  request: FastifyRequest,
  next: { turn: number; misses: number },
): void {
  const action = `${publicOrigin(request)}${VOICE_WEBHOOK_BASE}/speech?turn=${next.turn}&misses=${next.misses}`;

  response.gather({
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
