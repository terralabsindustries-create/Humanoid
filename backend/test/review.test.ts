import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/db/client.js";
import {
  causeKeyFor,
  getIssue,
  listIssues,
  raiseFromCallOutcome,
  raiseIssue,
  severityFor,
  updateIssue,
} from "../src/modules/review/review.service.js";
import {
  ESCALATION_TOOL_NAME,
  escalationRunner,
} from "../src/modules/telephony/escalation-tool.js";
import { endCall } from "../src/modules/conversations/conversation.service.js";
import type { FastifyInstance } from "fastify";
import { createTestApp, signUpAndVerify } from "./helpers.js";

/**
 * Review's one load-bearing claim is that a row is a *cause* and not an
 * incident — "you fix the missing answer once, not the forty-three calls it
 * affected". Almost everything below is a test of that: the same wall hit from
 * two calls has to be one row affecting two calls, and hit twice inside one
 * call has to be one row affecting one.
 */
describe("review", () => {
  let workspaceId: string;
  let aiEmployeeId: string;

  async function newCall(): Promise<string> {
    const conversation = await prisma.conversation.create({
      data: { workspaceId, aiEmployeeId, channelType: "voice", direction: "inbound", status: "active" },
    });
    return conversation.id;
  }

  beforeEach(async () => {
    const org = await prisma.organization.create({ data: { name: "Lumina", slug: "lumina" } });
    const workspace = await prisma.workspace.create({
      data: { organizationId: org.id, name: "Lumina Hotel", slug: "lumina-hotel" },
    });
    workspaceId = workspace.id;

    const employee = await prisma.aiEmployee.create({
      data: { workspaceId, name: "Ava", roleName: "Concierge" },
    });
    aiEmployeeId = employee.id;
  });

  const raise = (overrides: Partial<Parameters<typeof raiseIssue>[0]> = {}) =>
    raiseIssue({
      workspaceId,
      aiEmployeeId,
      conversationId: null,
      cause: "missing_knowledge",
      topic: "parking availability",
      title: "No approved answer for parking availability",
      detail: "Callers are asking this and nothing answers it.",
      ...overrides,
    });

  describe("cause identity", () => {
    it("treats the same topic as one cause regardless of case, punctuation or spacing", () => {
      expect(causeKeyFor("missing_knowledge", "Parking availability")).toBe(
        causeKeyFor("missing_knowledge", "  parking, availability!  "),
      );
    });

    it("keeps the same topic under two different failures apart", () => {
      // "We have no answer about parking" and "the rule about parking is
      // unclear" need different fixes and must not collapse into one row.
      expect(causeKeyFor("missing_knowledge", "parking")).not.toBe(
        causeKeyFor("policy_ambiguity", "parking"),
      );
    });

    it("does not produce a bare key for a topic with nothing usable in it", () => {
      expect(causeKeyFor("missing_knowledge", "???")).toBe("missing_knowledge:unspecified");
    });
  });

  describe("blast radius", () => {
    it("files two calls hitting the same wall as one cause affecting two calls", async () => {
      const first = await newCall();
      const second = await newCall();

      await raise({ conversationId: first });
      await raise({ conversationId: second, topic: "Parking Availability!" });

      const issues = await listIssues(workspaceId);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.affectedConversationCount).toBe(2);
      expect(issues[0]!.evidenceConversationIds).toEqual(
        expect.arrayContaining([first, second]),
      );
    });

    it("counts one call once, however many times it hits the same wall", async () => {
      const call = await newCall();

      await raise({ conversationId: call, evidence: "Is there parking?" });
      await raise({ conversationId: call, evidence: "So no parking then?" });

      const issues = await listIssues(workspaceId);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.affectedConversationCount).toBe(1);
    });

    it("keeps one workspace's causes out of another's", async () => {
      const other = await prisma.organization.create({ data: { name: "Rival", slug: "rival" } });
      const otherWorkspace = await prisma.workspace.create({
        data: { organizationId: other.id, name: "Rival Hotel", slug: "rival-hotel" },
      });

      await raise({ conversationId: await newCall() });

      expect(await listIssues(otherWorkspace.id)).toHaveLength(0);
      expect(await listIssues(workspaceId)).toHaveLength(1);
    });
  });

  describe("severity", () => {
    it("treats a failing connected system as serious on its first call", () => {
      expect(severityFor("tool_failure", 1)).toBe("high");
    });

    it("escalates a single unanswered question as it spreads", () => {
      expect(severityFor("missing_knowledge", 1)).toBe("medium");
      expect(severityFor("missing_knowledge", 5)).toBe("high");
      expect(severityFor("missing_knowledge", 20)).toBe("critical");
    });

    it("does not run off the end of the ladder", () => {
      expect(severityFor("tool_failure", 10_000)).toBe("critical");
    });

    it("moves with blast radius rather than being frozen at detection", async () => {
      await raise({ conversationId: await newCall() });
      expect((await listIssues(workspaceId))[0]!.severity).toBe("medium");

      for (let i = 0; i < 5; i += 1) await raise({ conversationId: await newCall() });
      expect((await listIssues(workspaceId))[0]!.severity).toBe("high");
    });
  });

  describe("triage", () => {
    it("reopens a resolved cause that happens again", async () => {
      const id = await raise({ conversationId: await newCall() });
      await updateIssue(workspaceId, id, { status: "resolved" });

      await raise({ conversationId: await newCall() });

      expect((await getIssue(workspaceId, id))!.status).toBe("open");
    });

    it("leaves a dismissed cause dismissed, which is the point of dismissing it", async () => {
      const id = await raise({ conversationId: await newCall() });
      await updateIssue(workspaceId, id, { status: "dismissed" });

      await raise({ conversationId: await newCall() });

      const issue = (await getIssue(workspaceId, id))!;
      expect(issue.status).toBe("dismissed");
      // Still counted, though — dismissing a cause is not pretending it stopped.
      expect(issue.affectedConversationCount).toBe(2);
    });

    it("will not move a cause belonging to another workspace", async () => {
      const other = await prisma.organization.create({ data: { name: "Rival", slug: "rival" } });
      const otherWorkspace = await prisma.workspace.create({
        data: { organizationId: other.id, name: "Rival Hotel", slug: "rival-hotel" },
      });

      const id = await raise({ conversationId: await newCall() });

      expect(await updateIssue(otherWorkspace.id, id, { status: "dismissed" })).toBeNull();
      expect((await getIssue(workspaceId, id))!.status).toBe("open");
    });
  });

  describe("causes visible in how a call ended", () => {
    it.each([
      ["no_speech", "transcription_failure"],
      ["turn_limit", "unclear_scope"],
      ["error", "tool_failure"],
    ])("raises %s as %s", async (outcomeCode, cause) => {
      await raiseFromCallOutcome({
        workspaceId,
        aiEmployeeId,
        conversationId: await newCall(),
        outcomeCode,
      });

      const issues = await listIssues(workspaceId);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.cause).toBe(cause);
    });

    it.each(["completed", "caller_hung_up", "abandoned"])(
      "raises nothing for %s, which is not a wall the employee hit",
      async (outcomeCode) => {
        await raiseFromCallOutcome({
          workspaceId,
          aiEmployeeId,
          conversationId: await newCall(),
          outcomeCode,
        });

        expect(await listIssues(workspaceId)).toHaveLength(0);
      },
    );

    it("runs off the end of a real call, on the path both transports finish through", async () => {
      const conversationId = await newCall();
      await prisma.callSession.create({
        data: {
          conversationId,
          providerCallId: `CA${Date.now()}`,
          fromNumber: "+447700900000",
          toNumber: "+441234567890",
        },
      });

      await endCall(conversationId, "turn_limit");

      const issues = await listIssues(workspaceId);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.cause).toBe("unclear_scope");
      expect(issues[0]!.affectedConversationCount).toBe(1);
    });
  });

  describe("flag_unresolved", () => {
    const runner = (conversationId: string | null) =>
      escalationRunner({ workspaceId, aiEmployeeId, conversationId });

    it.each([
      ["no_answer", "missing_knowledge"],
      ["rule_unclear", "policy_ambiguity"],
      ["not_allowed", "unclear_scope"],
      ["system_failed", "tool_failure"],
    ])("files %s as %s", async (reason, cause) => {
      await runner(await newCall())(ESCALATION_TOOL_NAME, {
        question: "Do you have parking?",
        topic: "parking availability",
        reason,
      });

      const issues = await listIssues(workspaceId);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.cause).toBe(cause);
    });

    it("keeps the caller's own words as the evidence", async () => {
      const conversationId = await newCall();
      await runner(conversationId)(ESCALATION_TOOL_NAME, {
        question: "Is there anywhere to leave a van overnight?",
        topic: "parking availability",
        reason: "no_answer",
      });

      const event = await prisma.reviewIssueEvent.findFirstOrThrow({ where: { conversationId } });
      expect(event.detail).toBe("Is there anywhere to leave a van overnight?");
    });

    it("still records the occurrence when the model invents a reason", async () => {
      await runner(await newCall())(ESCALATION_TOOL_NAME, {
        question: "Do you have parking?",
        topic: "parking availability",
        reason: "something_the_enum_does_not_have",
      });

      expect(await listIssues(workspaceId)).toHaveLength(1);
    });

    it("writes nothing without a topic to group it under", async () => {
      const said = await runner(await newCall())(ESCALATION_TOOL_NAME, { question: "Eh?" });

      expect(await listIssues(workspaceId)).toHaveLength(0);
      expect(said).toContain("did not work");
    });

    it("tells the model to keep this away from the caller", async () => {
      const said = await runner(await newCall())(ESCALATION_TOOL_NAME, {
        question: "Do you have parking?",
        topic: "parking availability",
        reason: "no_answer",
      });

      // The caller is on the line. "I've logged that for the business" is not
      // a service, and what the model is told here is what stops it saying so.
      expect(said.toLowerCase()).toContain("say nothing about this to the caller");
    });

    it("files against the call's own tenant, not one the model names", async () => {
      const other = await prisma.organization.create({ data: { name: "Rival", slug: "rival" } });
      const otherWorkspace = await prisma.workspace.create({
        data: { organizationId: other.id, name: "Rival Hotel", slug: "rival-hotel" },
      });

      await runner(await newCall())(ESCALATION_TOOL_NAME, {
        question: "Do you have parking?",
        topic: "parking availability",
        reason: "no_answer",
        workspaceId: otherWorkspace.id,
      });

      expect(await listIssues(otherWorkspace.id)).toHaveLength(0);
      expect(await listIssues(workspaceId)).toHaveLength(1);
    });

    it("answers any other tool name without writing anything", async () => {
      const said = await runner(await newCall())("delete_everything", {});

      expect(said).toContain("no tool called delete_everything");
      expect(await listIssues(workspaceId)).toHaveLength(0);
    });
  });
});

/**
 * The API in front of it.
 *
 * The two things worth asserting at this level are the ones that are not
 * visible from the service: that a cause is unreachable without a session, and
 * that being signed in as somebody is not the same as being a member of the
 * workspace whose queue you asked for.
 */
describe("review API", () => {
  let app: FastifyInstance;
  let cookie: string;
  let workspaceId: string;
  let issueId: string;

  beforeEach(async () => {
    app = await createTestApp();
    ({ cookie } = await signUpAndVerify(app, {
      name: "Jordan Ellis",
      email: "jordan@example.com",
      password: "password123",
    }));

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces",
      headers: { cookie },
      payload: {
        businessName: "Lumina Grand Hotel",
        website: "luminagrand.com",
        country: "United Kingdom",
        companySize: "51-200",
      },
    });
    workspaceId = created.json().data.workspace.id;

    const conversation = await prisma.conversation.create({
      data: { workspaceId, channelType: "voice", direction: "inbound", status: "active" },
    });

    issueId = await raiseIssue({
      workspaceId,
      aiEmployeeId: null,
      conversationId: conversation.id,
      cause: "missing_knowledge",
      topic: "parking availability",
      title: "No approved answer for parking availability",
      detail: "Callers are asking this and nothing answers it.",
      evidence: "Do you have parking?",
    });
  });

  const url = (suffix = "") => `/api/v1/workspaces/${workspaceId}/review/issues${suffix}`;

  it("returns the workspace's causes to a member", async () => {
    const res = await app.inject({ method: "GET", url: url(), headers: { cookie } });

    expect(res.statusCode).toBe(200);
    const issues = res.json().data;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      id: issueId,
      cause: "missing_knowledge",
      status: "open",
      severity: "medium",
      affectedConversationCount: 1,
    });
  });

  it("returns every status rather than only the open ones", async () => {
    await updateIssue(workspaceId, issueId, { status: "dismissed" });

    // The queue's four tabs each carry a count, so one request has to answer
    // for all four — filtering to "open" here would make it four requests.
    const res = await app.inject({ method: "GET", url: url(), headers: { cookie } });
    expect(res.json().data).toHaveLength(1);
  });

  it("refuses an unauthenticated caller", async () => {
    expect((await app.inject({ method: "GET", url: url() })).statusCode).toBe(401);
  });

  it("gives a non-member 404 rather than confirming the workspace exists", async () => {
    const { cookie: outsider } = await signUpAndVerify(app, {
      name: "Sam Reyes",
      email: "sam@example.com",
      password: "password123",
    });

    const res = await app.inject({ method: "GET", url: url(), headers: { cookie: outsider } });
    expect(res.statusCode).toBe(404);
  });

  it("moves a cause through triage", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: url(`/${issueId}`),
      headers: { cookie },
      payload: { status: "in_progress" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("in_progress");
    expect((await getIssue(workspaceId, issueId))!.status).toBe("in_progress");
  });

  it("rejects a status that is not one of the four", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: url(`/${issueId}`),
      headers: { cookie },
      payload: { status: "sort_of_fixed" },
    });

    expect(res.statusCode).toBe(400);
    expect((await getIssue(workspaceId, issueId))!.status).toBe("open");
  });

  it("404s a cause that does not exist, which is a normal link to follow", async () => {
    const res = await app.inject({
      method: "GET",
      url: url("/iss_gone"),
      headers: { cookie },
    });

    expect(res.statusCode).toBe(404);
  });
});
