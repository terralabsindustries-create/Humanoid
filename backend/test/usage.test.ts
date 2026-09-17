import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/db/client.js";
import { createTestApp, signUpAndVerify } from "./helpers.js";
import {
  getSnapshot,
  priceCall,
  recordCallUsage,
  setBudget,
  shouldAnswerCall,
  currentRates,
} from "../src/modules/usage/usage.service.js";

/**
 * Usage metering.
 *
 * The tests worth having here are the ones about the boundary between what is
 * measured and what is asserted: that a call's units come off the call, that a
 * provider which reported no tokens is recorded as unmetered rather than as
 * free, and that the cap actually stops the line rather than merely being
 * stored.
 */
describe("usage", () => {
  let workspaceId: string;

  async function newConversation(startedAt: Date) {
    const conversation = await prisma.conversation.create({
      data: { workspaceId, channelType: "voice", direction: "inbound", status: "completed", startedAt },
    });
    return conversation.id;
  }

  beforeEach(async () => {
    const org = await prisma.organization.create({ data: { name: "Lumina", slug: "lumina" } });
    const workspace = await prisma.workspace.create({
      data: {
        organizationId: org.id,
        name: "Lumina Hotel",
        slug: "lumina-hotel",
        timezone: "Europe/London",
      },
    });
    workspaceId = workspace.id;
  });

  describe("pricing", () => {
    const rates = {
      voicePerMinute: 9,
      modelInputPerMillionTokens: 8,
      modelOutputPerMillionTokens: 40,
    };

    it("bills telephony by the started minute, the way every carrier does", () => {
      // 61 seconds is two minutes on a phone bill. Rounding it down would
      // under-report every call in the system by up to a minute.
      expect(priceCall(61, null, rates).telephonyCost).toBe(18);
      expect(priceCall(60, null, rates).telephonyCost).toBe(9);
      expect(priceCall(1, null, rates).telephonyCost).toBe(9);
      expect(priceCall(0, null, rates).telephonyCost).toBe(0);
    });

    it("prices input and output tokens separately", () => {
      const { modelCost } = priceCall(
        0,
        { inputTokens: 1_000_000, outputTokens: 1_000_000, metered: true },
        rates,
      );
      expect(modelCost).toBeCloseTo(48, 6);
    });

    it("charges nothing for tokens nobody counted", () => {
      // The alternative — trusting the zeros — would price an unmetered call
      // as if the model had been free.
      const { modelCost } = priceCall(
        120,
        { inputTokens: 5_000, outputTokens: 900, metered: false },
        rates,
      );
      expect(modelCost).toBe(0);
    });
  });

  describe("recording a call", () => {
    it("measures connected seconds off the call itself", async () => {
      const startedAt = new Date("2026-08-10T09:00:00.000Z");
      const conversationId = await newConversation(startedAt);

      await recordCallUsage({
        workspaceId,
        conversationId,
        startedAt,
        endedAt: new Date("2026-08-10T09:02:30.000Z"),
        tokens: { inputTokens: 4_000, outputTokens: 600, metered: true },
      });

      const row = await prisma.callUsage.findUniqueOrThrow({ where: { conversationId } });
      expect(row.connectedSeconds).toBe(150);
      expect(row.tokensMetered).toBe(true);
      expect(row.modelInputTokens).toBe(4_000);
      // Three started minutes at the configured voice rate.
      expect(row.telephonyCost.toNumber()).toBeCloseTo(3 * currentRates().voicePerMinute, 4);
      // The rates are snapshotted so a later change cannot rewrite history.
      expect(row.ratesJson).toMatchObject({ voicePerMinute: currentRates().voicePerMinute });
    });

    it("keeps a fraction-of-a-penny model cost instead of rounding it to nothing", async () => {
      const startedAt = new Date("2026-08-10T09:00:00.000Z");
      const conversationId = await newConversation(startedAt);

      await recordCallUsage({
        workspaceId,
        conversationId,
        startedAt,
        endedAt: new Date("2026-08-10T09:01:00.000Z"),
        tokens: { inputTokens: 2_000, outputTokens: 400, metered: true },
      });

      const row = await prisma.callUsage.findUniqueOrThrow({ where: { conversationId } });
      // Rounding this at the row would report model spend as zero forever, no
      // matter how many calls were made.
      expect(row.modelCost.toNumber()).toBeGreaterThan(0);
      expect(row.modelCost.toNumber()).toBeLessThan(1);
    });

    it("does not bill the same call twice when a webhook is retried", async () => {
      const startedAt = new Date("2026-08-10T09:00:00.000Z");
      const conversationId = await newConversation(startedAt);
      const endedAt = new Date("2026-08-10T09:01:00.000Z");

      await recordCallUsage({ workspaceId, conversationId, startedAt, endedAt, tokens: null });
      await recordCallUsage({ workspaceId, conversationId, startedAt, endedAt, tokens: null });

      expect(await prisma.callUsage.count({ where: { workspaceId } })).toBe(1);
    });
  });

  describe("the snapshot", () => {
    it("sums the month and says what the money was derived from", async () => {
      const now = new Date();
      const startedAt = new Date(now.getTime() - 5 * 60_000);
      const conversationId = await newConversation(startedAt);

      await recordCallUsage({
        workspaceId,
        conversationId,
        startedAt,
        endedAt: now,
        tokens: { inputTokens: 3_000, outputTokens: 500, metered: true },
      });
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { outcomeCode: "completed" },
      });

      const snapshot = await getSnapshot(workspaceId);
      expect(snapshot).not.toBeNull();
      expect(snapshot!.spendMonth).toBe(5 * currentRates().voicePerMinute);
      expect(snapshot!.meter.connectedMinutesMonth).toBe(5);
      expect(snapshot!.meter.callsMonth).toBe(1);
      expect(snapshot!.meter.resolvedCallsMonth).toBe(1);
      expect(snapshot!.meter.modelTokensMonth).toBe(3_500);
      expect(snapshot!.meter.unmeteredCalls).toBe(0);
      // Cost per resolution is spend over resolved calls, not an invented rate.
      expect(snapshot!.costPerResolution).toBe(snapshot!.spendMonth);
    });

    it("reports unmetered tokens as unknown rather than as zero", async () => {
      const now = new Date();
      const startedAt = new Date(now.getTime() - 60_000);
      const conversationId = await newConversation(startedAt);

      await recordCallUsage({ workspaceId, conversationId, startedAt, endedAt: now, tokens: null });

      const snapshot = await getSnapshot(workspaceId);
      expect(snapshot!.meter.modelTokensMonth).toBeNull();
      expect(snapshot!.meter.unmeteredCalls).toBe(1);
    });

    it("starts with no budget, which is not the same as a budget of zero", async () => {
      const snapshot = await getSnapshot(workspaceId);
      expect(snapshot!.budgetMonth).toBeNull();
      expect(snapshot!.atCap).toBe("notify");
      expect(snapshot!.meter.capReached).toBe(false);
    });

    it("names the cap behaviours it cannot carry out, rather than hiding them", async () => {
      const snapshot = await getSnapshot(workspaceId);
      expect(snapshot!.capBlocked.voicemail).toBeTruthy();
      expect(snapshot!.capBlocked.stop).toBeUndefined();
    });
  });

  describe("setting the budget", () => {
    it("records who changed what from what, in the same transaction", async () => {
      const user = await prisma.user.create({
        data: { name: "Ada", email: "ada@lumina.test", passwordHash: "x", status: "active" },
      });

      await setBudget(workspaceId, { budgetMonth: 25_000, atCap: "stop", actorUserId: user.id });
      await setBudget(workspaceId, { budgetMonth: 50_000, atCap: "notify", actorUserId: user.id });

      const events = await prisma.auditEvent.findMany({
        where: { workspaceId, action: "billing.budget_changed" },
        orderBy: { createdAt: "asc" },
      });
      expect(events).toHaveLength(2);
      expect(events[1]!.metadataJson).toMatchObject({
        before: { budgetMonth: 25_000, atCap: "stop" },
        after: { budgetMonth: 50_000, atCap: "notify" },
      });
      expect(events[1]!.actorId).toBe(user.id);
    });
  });

  describe("the cap", () => {
    async function spend(minutes: number) {
      const now = new Date();
      const startedAt = new Date(now.getTime() - minutes * 60_000);
      const conversationId = await newConversation(startedAt);
      await recordCallUsage({ workspaceId, conversationId, startedAt, endedAt: now, tokens: null });
    }

    it("answers when spend is under budget", async () => {
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { budgetMonthMinor: 10_000, atCap: "stop" },
      });
      await spend(5);

      expect(await shouldAnswerCall(workspaceId)).toEqual({ answer: true });
    });

    it("stops answering once spend reaches the budget", async () => {
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { budgetMonthMinor: 18, atCap: "stop" },
      });
      await spend(2);

      const decision = await shouldAnswerCall(workspaceId);
      expect(decision.answer).toBe(false);
    });

    it("keeps answering on 'notify', which is what notify means", async () => {
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { budgetMonthMinor: 1, atCap: "notify" },
      });
      await spend(10);

      expect(await shouldAnswerCall(workspaceId)).toEqual({ answer: true });
    });

    it("answers when no budget is set at all", async () => {
      await spend(100);
      expect(await shouldAnswerCall(workspaceId)).toEqual({ answer: true });
    });
  });

  /**
   * The API, and specifically its gate.
   *
   * Spend is the one thing on this backend where "the frontend hides it" is
   * plainly not enough: the roster deliberately excludes billing from the
   * Operator preset, and a route that only checked membership would hand the
   * whole month's numbers to anyone in the workspace who typed the URL.
   */
  describe("the usage API", () => {
    let app: FastifyInstance;
    let cookie: string;
    let apiWorkspaceId: string;

    beforeEach(async () => {
      app = await createTestApp();
      ({ cookie } = await signUpAndVerify(app, {
        name: "Tom Whitfield",
        email: "tom@example.com",
        password: "password123",
      }));

      const created = await app.inject({
        method: "POST",
        url: "/api/v1/workspaces",
        headers: { cookie },
        payload: {
          businessName: "Lumina Grand",
          website: "luminagrand.com",
          country: "United Kingdom",
          companySize: "51-200",
        },
      });
      apiWorkspaceId = created.json().data.workspace.id;
    });

    const read = () =>
      app.inject({
        method: "GET",
        url: `/api/v1/workspaces/${apiWorkspaceId}/usage`,
        headers: { cookie },
      });

    const write = (payload: unknown) =>
      app.inject({
        method: "PUT",
        url: `/api/v1/workspaces/${apiWorkspaceId}/usage/budget`,
        headers: { cookie },
        payload,
      });

    it("returns the snapshot with the meter attached", async () => {
      const res = await read();
      expect(res.statusCode).toBe(200);

      const snapshot = res.json().data;
      expect(snapshot.spendMonth).toBe(0);
      expect(snapshot.budgetMonth).toBeNull();
      // The derivation travels with the number, so the screen can show its
      // working instead of asserting a total.
      expect(snapshot.meter).toMatchObject({
        capReached: false,
        callsMonth: 0,
        modelTokensMonth: null,
      });
      expect(snapshot.meter.rates.voicePerMinute).toBeGreaterThan(0);
    });

    it("saves a budget and hands back the updated snapshot", async () => {
      const res = await write({ budgetMonth: 25_000, atCap: "stop" });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ budgetMonth: 25_000, atCap: "stop" });

      expect((await read()).json().data.budgetMonth).toBe(25_000);
    });

    it("accepts a null budget without turning it into a cap of zero", async () => {
      await write({ budgetMonth: 25_000, atCap: "stop" });
      const res = await write({ budgetMonth: null, atCap: "notify" });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.budgetMonth).toBeNull();
      // A cap of zero would trip on the first call of the month; no budget
      // means nothing to trip.
      expect(res.json().data.meter.capReached).toBe(false);
    });

    it("refuses a cap behaviour nothing can carry out", async () => {
      const res = await write({ budgetMonth: 25_000, atCap: "voicemail" });
      expect(res.statusCode).toBe(403);
      // Refused with the reason, which is the same text the editor renders on
      // the option rather than hiding it.
      expect(res.json().error.message).toContain("voicemail");

      expect((await read()).json().data.budgetMonth).toBeNull();
    });

    it("refuses a role without billing access, through the route itself", async () => {
      // A second, real account — signed up the ordinary way, so this exercises
      // the route with a genuine session rather than the guard in isolation.
      const { cookie: operatorCookie } = await signUpAndVerify(app, {
        name: "Priya Raman",
        email: "priya@example.com",
        password: "password123",
      });
      const operator = await prisma.user.findFirstOrThrow({
        where: { email: "priya@example.com" },
      });
      const operatorRole = await prisma.role.findFirstOrThrow({
        where: { workspaceId: null, key: "operator" },
      });
      await prisma.workspaceMembership.create({
        data: {
          workspaceId: apiWorkspaceId,
          userId: operator.id,
          roleId: operatorRole.id,
          status: "active",
        },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/workspaces/${apiWorkspaceId}/usage`,
        headers: { cookie: operatorCookie },
      });
      // A member of the workspace, so there is nothing left to conceal by
      // returning 404 — but the Operator preset does not include billing.
      expect(res.statusCode).toBe(403);
      expect(JSON.stringify(res.json())).not.toContain("spendMonth");

      // And they cannot set the budget either.
      const write = await app.inject({
        method: "PUT",
        url: `/api/v1/workspaces/${apiWorkspaceId}/usage/budget`,
        headers: { cookie: operatorCookie },
        payload: { budgetMonth: 1_000, atCap: "stop" },
      });
      expect(write.statusCode).toBe(403);
    });

    it("hides another tenant's spend behind a 404 rather than a 403", async () => {
      const otherOrg = await prisma.organization.create({ data: { name: "Other", slug: "other" } });
      const otherWorkspace = await prisma.workspace.create({
        data: { organizationId: otherOrg.id, name: "Other Co", slug: "other-co" },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/workspaces/${otherWorkspace.id}/usage`,
        headers: { cookie },
      });
      // 404, not 403 — a 403 would confirm the workspace id is real.
      expect(res.statusCode).toBe(404);
    });
  });
});
