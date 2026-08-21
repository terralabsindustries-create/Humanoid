import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/config/env.js";

/**
 * The credential that gets a ConversationRelay socket through the door.
 *
 * Twilio does not sign the WebSocket upgrade the way it signs a webhook, so
 * the trust has to be carried forward from the one request that *was* signed:
 * `/twilio/voice/incoming` resolves which tenant owns the call, mints a token
 * naming it, and embeds it in the `wss://` URL it hands Twilio. The socket
 * then arrives already knowing who it is.
 *
 * That ordering is what keeps tenant isolation real. The relay session never
 * asks the socket which workspace it belongs to — a socket could lie. It reads
 * the workspace out of a token this process signed, and refuses the connection
 * if the CallSid announced in `setup` is not the one the token was minted for.
 */

export type VoiceTokenPayload = {
  callSid: string;
  workspaceId: string;
  employeeId: string;
  /** Row in `conversations`, when the record was opened successfully. */
  conversationId: string | null;
  /** Unix seconds. */
  exp: number;
};

/**
 * Twilio dials the socket within a second or two of receiving the TwiML, so
 * this only has to survive the handshake. Short is the point: a token that
 * leaked into a proxy log is worthless by the time anyone reads it.
 */
const TOKEN_TTL_SECONDS = 300;

function secret(): string {
  // COOKIE_SECRET is validated at 32+ characters and always present, which is
  // why it is the fallback rather than a generated-per-boot key: a key that
  // changed on restart would invalidate tokens for calls already in flight.
  return env.VOICE_RELAY_TOKEN_SECRET ?? env.COOKIE_SECRET;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function mintVoiceToken(
  payload: Omit<VoiceTokenPayload, "exp">,
  nowMs: number = Date.now(),
): string {
  const complete: VoiceTokenPayload = {
    ...payload,
    exp: Math.floor(nowMs / 1000) + TOKEN_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(complete), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Returns null for anything malformed, mis-signed or expired. */
export function verifyVoiceToken(token: string | undefined, nowMs: number = Date.now()): VoiceTokenPayload | null {
  if (!token) return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const body = token.slice(0, separator);
  const provided = token.slice(separator + 1);

  const expected = sign(body);
  const providedBytes = Buffer.from(provided, "base64url");
  const expectedBytes = Buffer.from(expected, "base64url");
  // timingSafeEqual throws on a length mismatch, so that has to be checked
  // first — and checking it is not a leak, the length is not the secret.
  if (providedBytes.length !== expectedBytes.length) return null;
  if (!timingSafeEqual(providedBytes, expectedBytes)) return null;

  let payload: VoiceTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as VoiceTokenPayload;
  } catch {
    return null;
  }

  if (typeof payload.callSid !== "string" || payload.callSid.length === 0) return null;
  if (typeof payload.workspaceId !== "string" || payload.workspaceId.length === 0) return null;
  if (typeof payload.exp !== "number" || payload.exp * 1000 < nowMs) return null;

  return payload;
}
