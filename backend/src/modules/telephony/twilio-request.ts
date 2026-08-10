import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";
import twilio from "twilio";
import { env } from "@/config/env.js";

/**
 * The subset of Twilio's voice webhook parameters this test reads. Twilio's
 * payload is form-encoded and much wider than this; every field is optional
 * because it is an external boundary we do not control the shape of.
 */
export type TwilioVoicePayload = {
  AccountSid?: string;
  CallSid?: string;
  CallStatus?: string;
  From?: string;
  To?: string;
  SpeechResult?: string;
  Confidence?: string;
};

/**
 * PUBLIC_BASE_URL wins over the request's own host because behind a tunnel
 * (ngrok) or proxy the host Fastify sees is rewritten, while Twilio signed the
 * URL as configured in its console. Falling back to the request's own view
 * keeps a direct, un-tunnelled localhost call working.
 */
export function publicOrigin(request: FastifyRequest): string {
  return env.PUBLIC_BASE_URL ?? `${request.protocol}://${request.host}`;
}

let warnedAboutMissingToken = false;

/**
 * Rejects anything that is not a genuine, untampered Twilio webhook.
 *
 * Fails closed in production. In development an unset TWILIO_AUTH_TOKEN
 * degrades to a loud warning instead of a hard failure, so the speech loop can
 * be exercised against a local tunnel before credentials are wired up.
 */
export function verifyTwilioRequest(request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction): void {
  const payload = (request.body ?? {}) as TwilioVoicePayload;

  const reject = (logLine: string, message: string): void => {
    request.log.warn(`Rejected Twilio webhook: ${logLine}`);
    // Replying without calling done() halts the request here.
    reply.code(403).send({ error: { code: "FORBIDDEN", message } });
  };

  // Cheap defence that still holds when signature checking is off in dev.
  if (env.TWILIO_ACCOUNT_SID && payload.AccountSid && payload.AccountSid !== env.TWILIO_ACCOUNT_SID) {
    reject("AccountSid does not match TWILIO_ACCOUNT_SID", "Unrecognised Twilio account.");
    return;
  }

  if (!env.TWILIO_AUTH_TOKEN) {
    if (env.NODE_ENV === "production") {
      reject("TWILIO_AUTH_TOKEN is not configured", "Twilio signature validation is not configured.");
      return;
    }
    if (!warnedAboutMissingToken) {
      warnedAboutMissingToken = true;
      request.log.warn("TWILIO_AUTH_TOKEN is unset — accepting Twilio webhooks WITHOUT signature validation (development only)");
    }
    done();
    return;
  }

  const signature = request.headers["x-twilio-signature"];
  if (typeof signature !== "string") {
    reject("missing X-Twilio-Signature header", "Missing Twilio signature.");
    return;
  }

  const url = `${publicOrigin(request)}${request.url}`;
  if (!twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, payload as Record<string, string>)) {
    // The URL is the usual culprit: it must match the Twilio Console entry
    // exactly, including scheme, host and query string.
    request.log.warn({ url }, "Rejected Twilio webhook: signature did not validate for this URL");
    reply.code(403).send({ error: { code: "FORBIDDEN", message: "Invalid Twilio signature." } });
    return;
  }

  done();
}
