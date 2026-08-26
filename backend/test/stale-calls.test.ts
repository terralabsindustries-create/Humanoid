import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/db/client.js";
import { abandonStaleCalls, startCall } from "../src/modules/conversations/conversation.service.js";

/**
 * The bug this prevents: the sidebar, live rail and conversation list all
 * showed a permanently frozen "2 live now", because a row opened by the
 * inbound webhook is never closed when the media socket doesn't arrive. A
 * dashboard that lies about the present is worse than one that shows nothing.
 */
describe("abandoning stale calls", () => {
  let workspaceId: string;

  beforeEach(async () => {
    const org = await prisma.organization.create({ data: { name: "Lumina", slug: "lumina" } });
    const workspace = await prisma.workspace.create({
      data: { organizationId: org.id, name: "Lumina Hotel", slug: "lumina-hotel" },
    });
    workspaceId = workspace.id;
  });

  async function openCall(callSid: string, startedAt?: Date) {
    const id = await startCall({
      workspaceId,
      aiEmployeeId: null,
      providerCallId: callSid,
      fromNumber: "+15550001111",
      toNumber: "+15550002222",
      language: "en-GB",
    });
    if (startedAt) {
      await prisma.conversation.update({ where: { id }, data: { startedAt } });
    }
    return id;
  }

  const statusOf = async (id: string) =>
    (await prisma.conversation.findUniqueOrThrow({ where: { id } })).status;

  it("closes every active call at boot, since no session survives a restart", async () => {
    const a = await openCall("CAone");
    const b = await openCall("CAtwo");

    const closed = await abandonStaleCalls({ olderThanMs: 0, activeCallSids: [] });

    expect(closed).toBe(2);
    expect(await statusOf(a)).toBe("failed");
    expect(await statusOf(b)).toBe("failed");
  });

  it("records them as abandoned rather than completed", async () => {
    const id = await openCall("CAone");
    await abandonStaleCalls({ olderThanMs: 0, activeCallSids: [] });

    const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id } });
    // "completed" would claim a call happened that never connected.
    expect(conversation.outcomeCode).toBe("abandoned");
    expect(conversation.endedAt).not.toBeNull();

    const session = await prisma.callSession.findUniqueOrThrow({ where: { providerCallId: "CAone" } });
    expect(session.status).toBe("no_answer");
  });

  it("never sweeps a call that currently has a live session", async () => {
    // Old enough to be swept on age alone — protected only by being live.
    const live = await openCall("CAlive", new Date(Date.now() - 60 * 60_000));
    const dead = await openCall("CAdead", new Date(Date.now() - 60 * 60_000));

    const closed = await abandonStaleCalls({ olderThanMs: 5 * 60_000, activeCallSids: ["CAlive"] });

    expect(closed).toBe(1);
    expect(await statusOf(live)).toBe("active");
    expect(await statusOf(dead)).toBe("failed");
  });

  it("leaves a just-opened call alone during the running sweep", async () => {
    // The webhook has fired but Twilio has not connected the socket yet.
    const justStarted = await openCall("CAfresh");

    const closed = await abandonStaleCalls({ olderThanMs: 5 * 60_000, activeCallSids: [] });

    expect(closed).toBe(0);
    expect(await statusOf(justStarted)).toBe("active");
  });

  it("does not touch calls that already ended", async () => {
    const id = await openCall("CAdone");
    await prisma.conversation.update({
      where: { id },
      data: { status: "completed", outcomeCode: "caller_hung_up", endedAt: new Date() },
    });

    expect(await abandonStaleCalls({ olderThanMs: 0, activeCallSids: [] })).toBe(0);
    const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id } });
    expect(conversation.outcomeCode).toBe("caller_hung_up");
  });
});
