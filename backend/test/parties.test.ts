import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/db/client.js";
import { createTestApp, signUpAndVerify } from "./helpers.js";
import {
  NAME_FACT_LABEL,
  getParty,
  isIdentifiablePhone,
  rememberCaller,
} from "../src/modules/parties/party.service.js";
import { createCallRecord, type ResolvedEmployee } from "../src/modules/telephony/ai-receptionist.js";
import { bookingRunner, BOOKING_TOOL_NAME } from "../src/modules/telephony/booking-tool.js";
import { NO_SCHEDULE_AWARENESS } from "../src/modules/schedule/schedule.service.js";

/**
 * The customer directory.
 *
 * Two things here are worth more than the rest. The first is that identity is
 * the caller's number and nothing else — a withheld number must produce no
 * record rather than a plausible one, because a record we cannot recognise
 * again is a duplicate waiting to happen. The second is that a human decision
 * outranks a transcription permanently: once somebody has verified a name,
 * the next call mishearing it must not quietly overwrite them.
 */
describe("customer directory", () => {
  const CALLER = "+919044909120";
  let workspaceId: string;

  beforeEach(async () => {
    const org = await prisma.organization.create({ data: { name: "Lumina", slug: "lumina" } });
    const workspace = await prisma.workspace.create({
      data: { organizationId: org.id, name: "Lumina Hotel", slug: "lumina-hotel" },
    });
    workspaceId = workspace.id;
  });

  async function makeConversation() {
    const conversation = await prisma.conversation.create({
      data: { workspaceId, channelType: "voice", direction: "inbound", status: "active" },
    });
    return conversation.id;
  }

  describe("recognising a caller", () => {
    it("files a first-time caller under their own number, and the call on their record", async () => {
      const conversationId = await makeConversation();

      const partyId = await rememberCaller({
        workspaceId,
        phone: CALLER,
        language: "en-GB",
        conversationId,
      });

      const party = await prisma.party.findUniqueOrThrow({ where: { id: partyId! } });
      // Nobody has said a name, so the number is the only true thing to put
      // at the top of the record.
      expect(party.displayName).toBe(CALLER);
      expect(party.primaryPhone).toBe(CALLER);
      expect(party.preferredLanguage).toBe("en-GB");
      expect(party.lastContactAt).not.toBeNull();

      const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
      expect(conversation.partyId).toBe(partyId);

      // Nothing is inferred: a call that produced no name produces no claims.
      expect(await prisma.partyFact.count({ where: { partyId: partyId! } })).toBe(0);
    });

    it("reuses the record on the next call rather than making a second one", async () => {
      const first = await rememberCaller({
        workspaceId,
        phone: CALLER,
        at: new Date("2026-08-01T09:00:00Z"),
      });
      const second = await rememberCaller({
        workspaceId,
        phone: CALLER,
        at: new Date("2026-08-20T09:00:00Z"),
      });

      expect(second).toBe(first);
      expect(await prisma.party.count({ where: { workspaceId } })).toBe(1);

      const party = await prisma.party.findUniqueOrThrow({ where: { id: first! } });
      expect(party.lastContactAt?.toISOString()).toBe("2026-08-20T09:00:00.000Z");
    });

    it("keeps two tenants' directories apart even on the same number", async () => {
      const other = await prisma.organization.create({ data: { name: "Rival", slug: "rival" } });
      const otherWorkspace = await prisma.workspace.create({
        data: { organizationId: other.id, name: "Rival Hotel", slug: "rival-hotel" },
      });

      const mine = await rememberCaller({ workspaceId, phone: CALLER });
      const theirs = await rememberCaller({ workspaceId: otherWorkspace.id, phone: CALLER });

      expect(theirs).not.toBe(mine);
      expect(await prisma.party.count()).toBe(2);
    });

    it("records nobody when the number is withheld", async () => {
      // Every spelling Twilio uses for "you cannot call this person back",
      // plus the placeholder the <Gather> path substitutes for a missing field.
      for (const withheld of ["anonymous", "restricted", "unavailable", "unknown", "+266696687", "", null]) {
        expect(isIdentifiablePhone(withheld)).toBe(false);
        expect(await rememberCaller({ workspaceId, phone: withheld })).toBeNull();
      }

      expect(await prisma.party.count()).toBe(0);
    });
  });

  describe("what a call adds", () => {
    const employee = (id: string): ResolvedEmployee => ({
      workspaceId,
      employeeId: id,
      employeeName: "Arsha",
      roleName: "Receptionist",
      businessName: "Lumina Hotel",
      industryKey: "hospitality",
      timezone: "Europe/London",
      behavior: {},
      escalationRules: {},
      operatingRules: {},
      // No opening hours and no capacity: this fixture predates the schedule
      // and must go on behaving as it did, which is exactly what the real
      // default is for every workspace that has not configured one.
      schedule: NO_SCHEDULE_AWARENESS,
    });

    async function makeEmployee() {
      const created = await prisma.aiEmployee.create({
        data: { workspaceId, name: "Arsha", roleName: "Receptionist" },
      });
      return created.id;
    }

    it("puts the caller in the directory the moment the call is answered", async () => {
      const employeeId = await makeEmployee();

      const { conversationId } = await createCallRecord("CA_directory_1", employee(employeeId), {
        from: CALLER,
        to: "+918590740343",
        direction: "inbound",
      });

      const party = await prisma.party.findFirstOrThrow({ where: { workspaceId } });
      expect(party.primaryPhone).toBe(CALLER);
      const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId! } });
      expect(conversation.partyId).toBe(party.id);
    });

    it("files the business's own number nowhere, on an outbound call", async () => {
      const employeeId = await makeEmployee();

      await createCallRecord("CA_directory_2", employee(employeeId), {
        // The business dials *from* its own number; the human is `to`.
        from: "+918590740343",
        to: CALLER,
        direction: "outbound",
      });

      const parties = await prisma.party.findMany({ where: { workspaceId } });
      expect(parties).toHaveLength(1);
      expect(parties[0].primaryPhone).toBe(CALLER);
    });

    it("names the record from a booking, as something the AI noted rather than checked", async () => {
      const conversationId = await makeConversation();
      await rememberCaller({ workspaceId, phone: CALLER, conversationId });

      await bookingRunner({
        workspaceId,
        conversationId,
        callerNumber: CALLER,
        timezone: "Europe/London",
      })(BOOKING_TOOL_NAME, { name: "Priya Raman", date: "2026-09-04", time: "20:00" });

      const party = await prisma.party.findFirstOrThrow({
        where: { workspaceId },
        include: { facts: true },
      });
      expect(party.displayName).toBe("Priya Raman");
      expect(party.facts).toHaveLength(1);
      expect(party.facts[0]).toMatchObject({
        label: NAME_FACT_LABEL,
        value: "Priya Raman",
        // Heard over a phone line. Nobody has checked it, and the screen's
        // whole job is asking somebody to.
        source: "ai_inferred",
        settledByUserId: null,
      });

      // The booking points at the person, and still carries what was said on
      // the call in its own right.
      const record = await prisma.record.findFirstOrThrow({ where: { workspaceId } });
      expect(record.partyId).toBe(party.id);
      expect(record.partyName).toBe("Priya Raman");
    });

    it("still writes the booking when the caller withheld their number", async () => {
      const conversationId = await makeConversation();

      const said = await bookingRunner({
        workspaceId,
        conversationId,
        callerNumber: null,
        timezone: "Europe/London",
      })(BOOKING_TOOL_NAME, { name: "Priya Raman", date: "2026-09-04", time: "20:00" });

      expect(said.toLowerCase()).toContain("confirmed");
      const record = await prisma.record.findFirstOrThrow({ where: { workspaceId } });
      expect(record.partyId).toBeNull();
      // The name and number given are the whole of what is known, and they
      // stay on the booking rather than becoming a person nobody can find.
      expect(record.partyName).toBe("Priya Raman");
      expect(await prisma.party.count()).toBe(0);
    });

    it("never lets a later call overwrite a name a person verified", async () => {
      const partyId = (await rememberCaller({ workspaceId, phone: CALLER, name: "Siobhan Reilly" }))!;
      await prisma.partyFact.updateMany({
        where: { partyId, label: NAME_FACT_LABEL },
        data: { source: "verified", settledByUserId: "user_1" },
      });
      await prisma.party.update({ where: { id: partyId }, data: { displayName: "Siobhan Reilly" } });

      // The next call mishears it, as speech recognition does with names.
      await rememberCaller({ workspaceId, phone: CALLER, name: "Shevonne Riley" });

      const party = await prisma.party.findUniqueOrThrow({
        where: { id: partyId },
        include: { facts: true },
      });
      expect(party.displayName).toBe("Siobhan Reilly");
      expect(party.facts[0]).toMatchObject({ value: "Siobhan Reilly", source: "verified" });
    });
  });

  describe("the directory API", () => {
    let app: FastifyInstance;
    let cookie: string;
    let apiWorkspaceId: string;
    let partyId: string;

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

      partyId = (await rememberCaller({
        workspaceId: apiWorkspaceId,
        phone: CALLER,
        name: "Priya Raman",
        language: "en-GB",
      }))!;
    });

    const list = (query = "") =>
      app.inject({
        method: "GET",
        url: `/api/v1/workspaces/${apiWorkspaceId}/parties${query}`,
        headers: { cookie },
      });

    it("lists everyone, with their facts and provenance", async () => {
      const res = await list();
      expect(res.statusCode).toBe(200);

      const parties = res.json().data;
      expect(parties).toHaveLength(1);
      expect(parties[0]).toMatchObject({
        id: partyId,
        displayName: "Priya Raman",
        phone: CALLER,
        preferredLanguage: "en-GB",
      });
      expect(parties[0].facts).toEqual([
        expect.objectContaining({ label: NAME_FACT_LABEL, value: "Priya Raman", source: "ai_inferred" }),
      ]);
    });

    it("searches names, numbers however they are typed, and facts", async () => {
      expect((await list("?search=priya")).json().data).toHaveLength(1);
      // A number is typed however the operator remembers it.
      expect((await list("?search=904 490 9120")).json().data).toHaveLength(1);
      expect((await list(`?search=${encodeURIComponent(NAME_FACT_LABEL)}`)).json().data).toHaveLength(1);
      expect((await list("?search=someone else")).json().data).toHaveLength(0);
    });

    it("filters to the people with something to confirm", async () => {
      const unnamed = await rememberCaller({ workspaceId: apiWorkspaceId, phone: "+447700900123" });
      expect(unnamed).not.toBeNull();

      const all = (await list()).json().data;
      expect(all).toHaveLength(2);

      // Only the one carrying an unchecked claim; a record holding nothing
      // has nothing to confirm.
      const queue = (await list("?unconfirmedOnly=true")).json().data;
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe(partyId);
    });

    it("confirming a fact verifies it, and says who did", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/workspaces/${apiWorkspaceId}/parties/${partyId}/facts/confirm`,
        headers: { cookie },
        payload: { label: NAME_FACT_LABEL },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.facts[0]).toMatchObject({ value: "Priya Raman", source: "verified" });

      const fact = await prisma.partyFact.findFirstOrThrow({ where: { partyId } });
      expect(fact.settledByUserId).not.toBeNull();

      // A person vouching for what the AI heard is exactly the kind of
      // decision the audit log exists to hold — but the value itself is not
      // copied into a log that outlives every retention policy.
      const audit = await prisma.auditEvent.findFirstOrThrow({ where: { action: "party.fact.confirmed" } });
      expect(audit.resourceId).toBe(partyId);
      expect(audit.metadataJson).toEqual({ label: NAME_FACT_LABEL });
    });

    it("correcting a name renames the record it heads", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/workspaces/${apiWorkspaceId}/parties/${partyId}/facts`,
        headers: { cookie },
        payload: { label: NAME_FACT_LABEL, value: "Priya Ramanathan" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ displayName: "Priya Ramanathan" });
      expect(res.json().data.facts[0]).toMatchObject({
        value: "Priya Ramanathan",
        source: "verified",
      });

      await prisma.auditEvent.findFirstOrThrow({ where: { action: "party.fact.corrected" } });
    });

    it("404s a fact that is not on the record", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/workspaces/${apiWorkspaceId}/parties/${partyId}/facts/confirm`,
        headers: { cookie },
        payload: { label: "Date of birth" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("will not read or write another tenant's directory", async () => {
      const outsiderParty = (await rememberCaller({ workspaceId, phone: "+447700900999" }))!;

      // Reading someone else's workspace is a 404, not a 403 — a 403 would
      // confirm the workspace id is real.
      const read = await app.inject({
        method: "GET",
        url: `/api/v1/workspaces/${workspaceId}/parties`,
        headers: { cookie },
      });
      expect(read.statusCode).toBe(404);

      // And a party id from another tenant is not reachable through a
      // workspace this user *is* in.
      const crossed = await app.inject({
        method: "GET",
        url: `/api/v1/workspaces/${apiWorkspaceId}/parties/${outsiderParty}`,
        headers: { cookie },
      });
      expect(crossed.statusCode).toBe(404);

      expect(await getParty(workspaceId, outsiderParty)).not.toBeNull();
    });
  });
});
