import type { AddressInfo } from "node:net";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import { prisma } from "../src/db/client.js";

/**
 * The realtime voice pipeline, end to end, with the model mocked.
 *
 * This drives a real HTTP webhook and a real WebSocket against a real Fastify
 * instance and a real Postgres — the only thing faked is Groq, because a test
 * that spends money is a test nobody runs. What it is actually checking is the
 * ordering problem the session service exists to solve: that a superseded turn
 * cannot reach the caller, and that what lands in the transcript is what the
 * caller heard rather than what the model wrote.
 */

type ReplyChunk = { kind: "delta"; text: string } | { kind: "end"; reason: string };
type Script = (signal?: AbortSignal) => AsyncGenerator<ReplyChunk>;

const mocks = vi.hoisted(() => ({ script: null as Script | null }));

vi.mock("@/modules/telephony/llm.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/modules/telephony/llm.js")>();
  return {
    ...actual,
    // A configured provider is what switches the line from transcription probe
    // to answering agent; without this the route serves <Gather> instead.
    activeProvider: () => "openai",
    activeModel: () => "test-model",
    streamReply: (_system: string, _turns: unknown, options?: { signal?: AbortSignal }) => {
      if (!mocks.script) throw new Error("test did not set a model script");
      return mocks.script(options?.signal);
    },
  };
});

const { buildApp } = await import("../src/app.js");
const { activeVoiceSessionCount, getVoiceSession } = await import(
  "../src/modules/telephony/voice-session.service.js"
);

const CALL_SID = "CAtest0000000000000000000000000001";

describe("realtime voice — Twilio ConversationRelay", () => {
  let app: FastifyInstance;
  let port: number;
  let workspaceId: string;
  let openSockets: WebSocket[] = [];

  /**
   * Built once for the file, not per test: `app.close()` runs the Prisma
   * plugin's onClose, which disconnects the singleton client the whole suite
   * shares — doing that between tests leaves the next one querying a
   * disconnected engine.
   */
  beforeAll(async () => {
    app = await buildApp();
    await app.listen({ port: 0, host: "127.0.0.1" });
    port = (app.server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    mocks.script = null;
    openSockets = [];

    const organization = await prisma.organization.create({
      data: { name: "Lumina Group", slug: "lumina-group" },
    });
    const workspace = await prisma.workspace.create({
      data: {
        organizationId: organization.id,
        name: "Lumina Grand Hotel",
        slug: "lumina-grand",
        industryKey: "hospitality",
        timezone: "Europe/London",
      },
    });
    workspaceId = workspace.id;

    const employee = await prisma.aiEmployee.create({
      data: { workspaceId, name: "ARIA", roleName: "Front desk receptionist", status: "active" },
    });
    const version = await prisma.aiEmployeeConfigurationVersion.create({
      data: {
        aiEmployeeId: employee.id,
        versionNumber: 1,
        behaviorJson: { communicationStyle: "warm_professional" },
        escalationRulesJson: { triggers: ["complaint"] },
      },
    });
    await prisma.aiEmployee.update({
      where: { id: employee.id },
      data: { currentConfigurationVersionId: version.id },
    });
  });

  // Leaving a socket open would leave its session live into the next test,
  // whose truncation has already deleted the conversation it writes to.
  afterEach(async () => {
    for (const socket of openSockets) socket.close();
    await waitFor(() => activeVoiceSessionCount() === 0, "sessions drained");
  });

  /** Answers the inbound webhook and returns the TwiML Twilio would receive. */
  async function inboundCall(callSid = CALL_SID): Promise<string> {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/twilio/voice/incoming`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        CallSid: callSid,
        From: "+447700900123",
        To: "+17372508034",
        CallStatus: "ringing",
      }).toString(),
    });
    expect(response.status).toBe(200);
    return response.text();
  }

  function relayUrlFrom(twiml: string): string {
    const match = /<ConversationRelay[^>]*\burl="([^"]+)"/.exec(twiml);
    expect(match, `no ConversationRelay url in TwiML:\n${twiml}`).not.toBeNull();
    return match![1]!.replace(/&amp;/g, "&");
  }

  it("answers with ConversationRelay TwiML pointing at the relay socket", async () => {
    const twiml = await inboundCall();

    expect(twiml).toContain("<Connect>");
    expect(twiml).toContain("<ConversationRelay");
    expect(twiml).toContain('ttsProvider="ElevenLabs"');
    // Barge-in has to be on at the Twilio end or the caller physically cannot
    // interrupt, no matter what this backend does about it.
    expect(twiml).toContain('interruptible="true"');
    // Spoken by Twilio before any round trip through this backend.
    expect(twiml).toContain("Lumina Grand Hotel");
    // The <Gather> loop must not also be armed — two transports on one call.
    expect(twiml).not.toContain("<Gather");

    const url = relayUrlFrom(twiml);
    expect(url.startsWith(`ws://127.0.0.1:${port}/api/v1/twilio/voice/relay?t=`)).toBe(true);
  });

  it("opens a call record before the socket connects", async () => {
    await inboundCall();

    const session = await prisma.callSession.findUnique({
      where: { providerCallId: CALL_SID },
      include: { conversation: true },
    });
    expect(session?.status).toBe("in_progress");
    expect(session?.conversation.workspaceId).toBe(workspaceId);
    expect(session?.conversation.status).toBe("active");
  });

  it("refuses a socket without a valid handshake token", async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/v1/twilio/voice/relay?t=forged`);
    const failure = await new Promise<string>((resolve) => {
      socket.on("error", () => resolve("error"));
      socket.on("open", () => resolve("open"));
    });
    socket.close();
    expect(failure).toBe("error");
    expect(activeVoiceSessionCount()).toBe(0);
  });

  it("refuses a setup announcing a different CallSid than the token was minted for", async () => {
    const relay = await connect(await inboundCall());

    relay.send({ type: "setup", callSid: "CAsomeoneElsesCall", from: "+1", to: "+2" });
    await relay.closed;

    expect(activeVoiceSessionCount()).toBe(0);
  });

  it("binds the call to the employee the token names, not to whoever is newest", async () => {
    // The call is routed and the token minted here...
    const twiml = await inboundCall();

    // ...and then a second tenant configures an employee. `resolveAiEmployee`
    // orders by updatedAt, so a relay that re-ran that heuristic on connect
    // would now pick this one and answer as the wrong business.
    const other = await prisma.organization.create({ data: { name: "Northwind", slug: "northwind" } });
    const otherWorkspace = await prisma.workspace.create({
      data: { organizationId: other.id, name: "Northwind Clinic", slug: "northwind-clinic" },
    });
    const otherEmployee = await prisma.aiEmployee.create({
      data: { workspaceId: otherWorkspace.id, name: "Wren", roleName: "Receptionist" },
    });
    const otherVersion = await prisma.aiEmployeeConfigurationVersion.create({
      data: {
        aiEmployeeId: otherEmployee.id,
        versionNumber: 1,
        behaviorJson: {},
        escalationRulesJson: {},
      },
    });
    await prisma.aiEmployee.update({
      where: { id: otherEmployee.id },
      data: { currentConfigurationVersionId: otherVersion.id },
    });

    const relay = await connect(twiml);
    await relay.setup();

    const session = getVoiceSession(CALL_SID);
    expect(session?.workspaceId).toBe(workspaceId);
    expect(session?.employee.employeeName).toBe("ARIA");
    expect(session?.employee.businessName).toBe("Lumina Grand Hotel");
  });

  it("streams a Groq reply back as text frames and persists both turns", async () => {
    mocks.script = scriptOf("Of course, I can help with that. ", "What time would suit you?");

    const relay = await connect(await inboundCall());
    await relay.setup();

    relay.send({ type: "prompt", voicePrompt: "I'd like to book a table", last: true });
    await relay.waitForTurnEnd();

    // More than one frame is the point: the caller starts hearing the reply
    // before the model has finished writing it.
    expect(relay.textFrames.length).toBeGreaterThan(1);
    expect(relay.spoken()).toBe("Of course, I can help with that. What time would suit you?");

    const messages = await transcript();
    expect(messages.map((m) => [m.speakerType, m.textContent])).toEqual([
      ["customer", "I'd like to book a table"],
      ["ai", "Of course, I can help with that. What time would suit you?"],
    ]);
    expect((messages[1]!.metadataJson as Record<string, unknown>).ttsProvider).toBe("ElevenLabs");
  });

  it("stops speaking on barge-in, records only what was heard, and answers the new turn", async () => {
    const held = deferred<void>();
    let sawAbort = false;

    mocks.script = async function* (signal?: AbortSignal) {
      yield { kind: "delta" as const, text: "Sure, I can schedule an appointment for " };
      await held.promise;
      sawAbort = signal?.aborted ?? false;
      // Deliberately keeps writing after the interruption. Nothing here may
      // reach the caller — proving the turn guard holds on its own, without
      // relying on the abort having already stopped the generator.
      yield { kind: "delta" as const, text: "Thursday at three o'clock." };
      yield { kind: "end" as const, reason: "ok" };
    };

    const relay = await connect(await inboundCall());
    await relay.setup();

    relay.send({ type: "prompt", voicePrompt: "I want to book an appointment", last: true });
    await waitFor(() => relay.textFrames.length > 0, "first frame");

    relay.send({
      type: "interrupt",
      utteranceUntilInterrupt: "Sure, I can schedule an appointment for",
      durationUntilInterruptMs: 460,
    });
    // Wait for the server to actually retire the turn — releasing the model
    // before that would be racing our own interrupt.
    await waitFor(() => getVoiceSession(CALL_SID)?.current == null, "generation retired");

    const framesAtInterrupt = relay.textFrames.length;
    held.resolve();
    await settle();

    expect(sawAbort).toBe(true);
    // The obsolete continuation never reached the caller.
    expect(relay.textFrames.length).toBe(framesAtInterrupt);
    expect(relay.spoken()).not.toContain("Thursday");
    expect(relay.frames.some((f) => f.last === true)).toBe(false);

    // The new turn is answered normally.
    mocks.script = scriptOf("No problem, I can cancel that for you.");
    relay.send({ type: "prompt", voicePrompt: "Actually I want to cancel", last: true });
    await relay.waitForTurnEnd();

    const messages = await transcript();
    expect(messages.map((m) => [m.speakerType, m.textContent])).toEqual([
      ["customer", "I want to book an appointment"],
      // What the caller actually heard, not what the model went on to write.
      ["ai", "Sure, I can schedule an appointment for"],
      ["customer", "Actually I want to cancel"],
      ["ai", "No problem, I can cancel that for you."],
    ]);
    expect((messages[1]!.metadataJson as Record<string, unknown>).interrupted).toBe(true);
  });

  it("recovers mid-stream when the model fails, without losing what was already said", async () => {
    mocks.script = async function* () {
      await Promise.resolve();
      yield { kind: "delta" as const, text: "Let me check that for you. " };
      await Promise.resolve();
      throw new Error("groq exploded: key sk-live-should-never-surface");
    };

    const relay = await connect(await inboundCall());
    await relay.setup();

    relay.send({ type: "prompt", voicePrompt: "Are you open on Sunday?", last: true });
    await relay.waitForTurnEnd();

    // The apology is appended, not substituted: the first sentence already
    // reached the caller's ear and the transcript has to agree.
    expect(relay.spoken()).toBe(
      "Let me check that for you. I'm having trouble accessing that right now. Could you try again?",
    );
    // Nothing about the failure itself reaches the caller.
    expect(relay.spoken()).not.toContain("groq");
    expect(relay.spoken()).not.toContain("sk-live");
    // The call survives a model failure.
    expect(relay.socket.readyState).toBe(WebSocket.OPEN);

    const messages = await transcript();
    expect(messages[1]!.textContent).toContain("Let me check that for you.");
    expect(messages[1]!.textContent).toContain("I'm having trouble accessing that right now.");
  });

  it("hangs up when the employee signals the call is over, without ever speaking the marker", async () => {
    mocks.script = scriptOf("You're welcome! ", "Have a lovely day. ", "[[END_CALL]]");

    const relay = await connect(await inboundCall());
    await relay.setup();
    relay.send({ type: "prompt", voicePrompt: "That's all, thank you", last: true });
    await relay.waitForTurnEnd();

    // The farewell is spoken in full; the marker is not spoken at all.
    expect(relay.spoken()).toBe("You're welcome! Have a lovely day.");
    expect(relay.spoken()).not.toContain("END_CALL");
    expect(relay.spoken()).not.toContain("[[");

    await waitFor(() => relay.frames.some((f) => f.type === "end"), "end frame");
    expect(activeVoiceSessionCount()).toBe(0);

    const messages = await transcript();
    // The marker is call control, not something the employee said.
    expect(messages[1]!.textContent).toBe("You're welcome! Have a lovely day.");

    await waitFor(async () => {
      const c = await prisma.conversation.findFirst({ where: { workspaceId } });
      return c?.outcomeCode === "completed";
    }, "recorded as completed, not a caller hang-up");
  });

  it("never leaks the marker even when it arrives split across deltas", async () => {
    // The realistic streaming case: "[[END" then "_CALL]]".
    mocks.script = scriptOf("Goodbye now. ", "[[END", "_CALL", "]]");

    const relay = await connect(await inboundCall());
    await relay.setup();
    relay.send({ type: "prompt", voicePrompt: "bye", last: true });
    await relay.waitForTurnEnd();

    expect(relay.spoken()).toBe("Goodbye now.");
    expect(relay.spoken()).not.toMatch(/\[\[|END|CALL/);
    await waitFor(() => relay.frames.some((f) => f.type === "end"), "end frame");
  });

  it("stays on the line when the employee does not signal an ending", async () => {
    mocks.script = scriptOf("Sure, what time suits you?");

    const relay = await connect(await inboundCall());
    await relay.setup();
    relay.send({ type: "prompt", voicePrompt: "I'd like to book", last: true });
    await relay.waitForTurnEnd();

    expect(relay.frames.some((f) => f.type === "end")).toBe(false);
    expect(activeVoiceSessionCount()).toBe(1);
  });

  it("ignores the marker when the reply is still asking the caller a question", async () => {
    // Taken verbatim from a real call: the model wrote out the whole rest of
    // the conversation in one turn, both sides included, and signed off at the
    // end of its own script — hanging up on a caller who had given nothing but
    // their name. A farewell does not end by asking for something.
    mocks.script = scriptOf(
      "Thank you, Akbar. Which day would you like the appointment?",
      "And what time would you like?",
      "[[END_CALL]]",
    );

    const relay = await connect(await inboundCall());
    await relay.setup();
    relay.send({ type: "prompt", voicePrompt: "My name is Akbar Salil", last: true });
    await relay.waitForTurnEnd();

    expect(relay.spoken()).not.toContain("END_CALL");
    expect(relay.frames.some((f) => f.type === "end")).toBe(false);
    expect(activeVoiceSessionCount()).toBe(1);

    // Still answerable: the caller gets to say the thing they were asked for.
    mocks.script = scriptOf("Booked. Goodbye. ", "[[END_CALL]]");
    relay.send({ type: "prompt", voicePrompt: "Tuesday at three", last: true });
    await relay.waitForTurnEnd();
    await waitFor(() => relay.frames.some((f) => f.type === "end"), "end frame on a real farewell");
  });

  it("cleans up the session and finalises the conversation when the caller hangs up", async () => {
    mocks.script = scriptOf("Certainly.");

    const relay = await connect(await inboundCall());
    await relay.setup();
    relay.send({ type: "prompt", voicePrompt: "Thanks, goodbye", last: true });
    await relay.waitForTurnEnd();

    expect(activeVoiceSessionCount()).toBe(1);

    relay.socket.close();
    await waitFor(() => activeVoiceSessionCount() === 0, "session cleanup");

    await waitFor(async () => {
      const conversation = await prisma.conversation.findFirst({ where: { workspaceId } });
      return conversation?.status === "completed";
    }, "conversation finalised");

    const session = await prisma.callSession.findUnique({ where: { providerCallId: CALL_SID } });
    expect(session?.status).toBe("completed");
    expect(session?.endedAt).not.toBeNull();
    const metrics = session?.latencyMetricsJson as Record<string, unknown>;
    expect(metrics.transport).toBe("conversation_relay");
    expect(metrics.turns).toBe(1);
  });

  // ───────────────────────────────────────────────────────────────── helpers

  type Frame = { type: string; token?: string; last?: boolean; handoffData?: string };

  async function connect(twiml: string) {
    const socket = new WebSocket(relayUrlFrom(twiml));
    openSockets.push(socket);
    const frames: Frame[] = [];

    const closed = new Promise<void>((resolve) => socket.on("close", () => resolve()));

    socket.on("message", (data: Buffer) => {
      frames.push(JSON.parse(data.toString("utf8")) as Frame);
    });

    await new Promise<void>((resolve, reject) => {
      socket.on("open", () => resolve());
      socket.on("error", reject);
    });

    const relay = {
      socket,
      frames,
      closed,
      get textFrames() {
        return frames.filter((f) => f.type === "text" && (f.token ?? "").length > 0);
      },
      spoken: () => relay.textFrames.map((f) => f.token ?? "").join(""),
      send(message: Record<string, unknown>) {
        socket.send(JSON.stringify(message));
      },
      async setup() {
        relay.send({
          type: "setup",
          callSid: CALL_SID,
          from: "+447700900123",
          to: "+17372508034",
          direction: "inbound",
        });
        await waitFor(() => activeVoiceSessionCount() === 1, "relay session opened");
      },
      async waitForTurnEnd() {
        await waitFor(() => frames.some((f) => f.type === "text" && f.last === true), "turn end frame");
        // Persistence is queued behind the frame that ends the turn.
        await settle();
      },
    };

    return relay;
  }

  async function transcript() {
    const conversation = await prisma.conversation.findFirstOrThrow({ where: { workspaceId } });
    return prisma.conversationMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { sequenceNumber: "asc" },
    });
  }
});

/**
 * A model that writes the given deltas. The `await` between them is not
 * ceremony — it hands control back to the event loop the way a real network
 * stream does, so the session's interleaving is exercised rather than a
 * synchronous run-to-completion that could never be interrupted.
 */
function scriptOf(...deltas: string[]): Script {
  return async function* () {
    for (const text of deltas) {
      await Promise.resolve();
      yield { kind: "delta" as const, text };
    }
    yield { kind: "end" as const, reason: "ok" };
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  label: string,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Lets queued microtasks and the session's persistence chain drain. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 120));
}
