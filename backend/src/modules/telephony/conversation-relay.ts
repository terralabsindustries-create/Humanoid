import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { RawData, WebSocket } from "ws";
import { env } from "@/config/env.js";
import { resolveAiEmployeeById } from "@/modules/telephony/ai-receptionist.js";
import { parseRelayMessage, serializeRelayMessage, type RelayInbound } from "@/modules/telephony/relay-protocol.js";
import { verifyVoiceToken, type VoiceTokenPayload } from "@/modules/telephony/voice-token.js";
import {
  activeVoiceSessionCount,
  closeVoiceSession,
  handleCallerTurn,
  handleInterrupt,
  openVoiceSession,
  type VoiceSession,
  type VoiceSessionTransport,
} from "@/modules/telephony/voice-session.service.js";

/**
 * The ConversationRelay socket.
 *
 * Twilio connects here once per call and keeps the socket open until the
 * caller hangs up. It sends transcribed speech and interruption events; we
 * send text to be spoken. No audio crosses this boundary in either direction —
 * Twilio runs speech recognition on its side and ElevenLabs synthesis on its
 * side, which is why this backend holds no ElevenLabs credential.
 *
 * This file is deliberately thin. Everything about *when* to speak lives in
 * `voice-session.service.ts`; what is here is the socket lifecycle and the
 * admission check.
 */

export const VOICE_RELAY_PATH = "/twilio/voice/relay";

export function registerConversationRelay(app: FastifyInstance): void {
  app.get(
    VOICE_RELAY_PATH,
    {
      websocket: true,
      logLevel: "warn",
      // Runs before the upgrade completes, so an unauthenticated socket is
      // refused with a 403 rather than being established and then dropped.
      preValidation: (request: FastifyRequest, reply: FastifyReply, done: (error?: Error) => void) => {
        if (readToken(request) === null) {
          request.log.warn("Rejected ConversationRelay upgrade: missing or invalid handshake token");
          void reply.code(403).send({ error: { code: "FORBIDDEN", message: "Invalid voice relay token." } });
          return;
        }
        done();
      },
    },
    (socket: WebSocket, request: FastifyRequest) => {
      const token = readToken(request);
      if (token === null) {
        socket.close(1008, "unauthorized");
        return;
      }
      attach(socket, request, token);
    },
  );
}

/** `ws` hands over a Buffer, an ArrayBuffer, or the fragments of a split frame. */
function decodeFrame(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return Buffer.from(data).toString("utf8");
}

function readToken(request: FastifyRequest): VoiceTokenPayload | null {
  const query = request.query as Record<string, string | undefined> | undefined;
  return verifyVoiceToken(query?.t);
}

function attach(socket: WebSocket, request: FastifyRequest, token: VoiceTokenPayload): void {
  let session: VoiceSession | null = null;
  /** Set once the caller hangs up or we end the call, so cleanup runs once. */
  let closing = false;

  const transport: VoiceSessionTransport = {
    sendText(text, last) {
      if (socket.readyState !== socket.OPEN) return;
      socket.send(serializeRelayMessage({ type: "text", token: text, last }));
    },
    end(reason) {
      if (socket.readyState !== socket.OPEN) return;
      socket.send(serializeRelayMessage({ type: "end", handoffData: JSON.stringify({ reason }) }));
    },
  };

  const teardown = (outcome: string): void => {
    if (closing) return;
    closing = true;
    if (!session) return;
    // Detached deliberately: the socket is already going away and nothing is
    // left to report an error to. `closeVoiceSession` swallows its own.
    void closeVoiceSession(token.callSid, outcome);
  };

  socket.on("message", (data: RawData, isBinary: boolean) => {
    // ConversationRelay speaks JSON. A binary frame is not ours to interpret.
    if (isBinary) return;

    const message = parseRelayMessage(decodeFrame(data));
    if (!message) return;

    void handleMessage(message).catch((error: unknown) => {
      request.log.error({ err: error }, "ConversationRelay message handling failed");
    });
  });

  socket.on("close", () => teardown("caller_hung_up"));

  socket.on("error", (error: Error) => {
    request.log.warn({ err: error }, "ConversationRelay socket error");
    teardown("error");
  });

  async function handleMessage(message: RelayInbound): Promise<void> {
    switch (message.type) {
      case "setup": {
        // The token names the call this socket is allowed to be. A setup
        // announcing a different CallSid is either a replayed token or a bug;
        // either way it must not be allowed to attach to another tenant.
        if (message.callSid && message.callSid !== token.callSid) {
          request.log.warn("Rejected ConversationRelay setup: CallSid does not match handshake token");
          socket.close(1008, "call mismatch");
          return;
        }
        if (env.TWILIO_ACCOUNT_SID && message.accountSid && message.accountSid !== env.TWILIO_ACCOUNT_SID) {
          request.log.warn("Rejected ConversationRelay setup: unrecognised AccountSid");
          socket.close(1008, "account mismatch");
          return;
        }

        // Loaded by the id the signed token names, never by anything the
        // socket said. The workspace check is belt and braces: the two come
        // from the same token, so a mismatch means the employee was moved
        // between workspaces mid-call, and refusing is the safe answer.
        const employee = await resolveAiEmployeeById(token.employeeId);
        if (!employee || employee.workspaceId !== token.workspaceId) {
          request.log.error(
            { workspaceId: token.workspaceId },
            "ConversationRelay setup: the AI employee this call was routed to no longer resolves",
          );
          socket.close(1011, "no configured employee");
          return;
        }

        session = openVoiceSession({
          callSid: token.callSid,
          workspaceId: token.workspaceId,
          employeeId: token.employeeId,
          conversationId: token.conversationId,
          employee,
          transport,
        });

        console.log(
          `[VOICE] ${token.callSid} call started — ${employee.employeeName} @ ${employee.businessName}` +
            ` (tts ${env.TWILIO_TTS_PROVIDER}, ${activeVoiceSessionCount()} live)`,
        );
        return;
      }

      case "prompt": {
        // Partial prompts are progress reports, not turns. Acting on one would
        // answer half a sentence.
        if (message.last === false) return;
        if (!session) return;
        handleCallerTurn(session, message.voicePrompt ?? "");
        return;
      }

      case "interrupt": {
        if (!session) return;
        handleInterrupt(session, message.utteranceUntilInterrupt);
        return;
      }

      case "dtmf":
        // Keypad input has no meaning until there is a menu or a procedure to
        // drive with it. Logged, not invented into a behaviour.
        request.log.info("ConversationRelay DTMF received");
        return;

      case "error":
        request.log.warn({ description: message.description }, "ConversationRelay reported an error");
        return;
    }
  }
}
