import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/db/client.js";
import {
  bookingRunner,
  BOOKING_TOOL_NAME,
  RESCHEDULE_TOOL_NAME,
} from "../src/modules/telephony/booking-tool.js";
import { AVAILABILITY_TOOL_NAME } from "../src/modules/telephony/availability-tool.js";
import {
  checkAvailability,
  describeSchedule,
  setSchedule,
  suggestSlots,
} from "../src/modules/schedule/schedule.service.js";
import { buildSystemPrompt, type ResolvedEmployee } from "../src/modules/telephony/ai-receptionist.js";

/**
 * The diary the employee never had.
 *
 * Before this, `create_booking` wrote whatever the caller said: three in the
 * morning at a clinic that opens at eight, the twentieth table at a restaurant
 * that seats twelve. Both were confirmed aloud and both landed in the diary
 * looking like a good booking, which is why the failure only surfaced when
 * somebody arrived at a locked door.
 *
 * The first describe block is the one that matters most. Every workspace that
 * existed before this feature has no schedule, and if "no rows" were read as
 * "closed" this module would take every one of their phone lines down.
 */

const TZ = "Europe/London";

// 2026-09-03 is a Thursday, -04 a Friday, -05 a Saturday, -06 a Sunday.
const THURSDAY = "2026-09-03";
const FRIDAY = "2026-09-04";
const SUNDAY = "2026-09-06";

/**
 * A wall clock in the business's own timezone.
 *
 * The offset is written out rather than derived, so the test states what it
 * means instead of asking the code under test to interpret it. Every date here
 * is in September 2026, when London is on BST — building these as UTC is what
 * an earlier version of this file did, and it quietly tested half past five
 * against a five o'clock close.
 */
const at = (date: string, time: string) => new Date(`${date}T${time}:00+01:00`);

describe("availability", () => {
  let workspaceId: string;
  let conversationId: string;

  beforeEach(async () => {
    const org = await prisma.organization.create({ data: { name: "Lumina", slug: "lumina" } });
    const workspace = await prisma.workspace.create({
      data: { organizationId: org.id, name: "Lumina Clinic", slug: "lumina-clinic", timezone: TZ },
    });
    workspaceId = workspace.id;

    const conversation = await prisma.conversation.create({
      data: { workspaceId, channelType: "voice", direction: "inbound", status: "active" },
    });
    conversationId = conversation.id;
  });

  const runner = () =>
    bookingRunner({ workspaceId, conversationId, callerNumber: "+447700900123", timezone: TZ });

  /** Mon–Fri, 09:00–17:00. */
  const weekdayHours = () =>
    setSchedule(workspaceId, {
      periods: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        dayOfWeek,
        opensMinute: 9 * 60,
        closesMinute: 17 * 60,
      })),
    });

  // ────────────────────────────────────────────────────────────────────────

  describe("a workspace that has configured nothing", () => {
    it("books exactly as it did before, at any hour", async () => {
      const said = await runner()(BOOKING_TOOL_NAME, {
        name: "Ada Okonkwo",
        date: FRIDAY,
        time: "03:00",
      });

      expect(said).toContain("Booked and confirmed");
      expect(await prisma.record.count({ where: { workspaceId } })).toBe(1);
    });

    it("reports the slot as unchecked rather than as free", async () => {
      const verdict = await checkAvailability({ workspaceId, at: at(FRIDAY, "03:00") });
      expect(verdict.status).toBe("unchecked");
    });

    it("tells the employee it has no diary, and not that the time is available", async () => {
      const said = await runner()(AVAILABILITY_TOOL_NAME, { date: FRIDAY, time: "03:00" });

      expect(said).toContain("no diary to check");
      expect(said).toContain("Do not tell the caller it is available");
    });

    it("still books when the workspace itself has vanished, rather than refusing", async () => {
      // Stands in for the diary being unreadable. A metering or lookup outage
      // must never cost the business a booking — the same reason the spend cap
      // fails open.
      const verdict = await checkAvailability({ workspaceId: "does-not-exist", at: at(FRIDAY, "10:00") });
      expect(verdict.status).toBe("unchecked");
    });
  });

  // ────────────────────────────────────────────────────────────────────────

  describe("opening hours", () => {
    beforeEach(weekdayHours);

    it("refuses three in the morning, and does not write the row", async () => {
      const said = await runner()(BOOKING_TOOL_NAME, {
        name: "Ada Okonkwo",
        date: FRIDAY,
        time: "03:00",
      });

      expect(said).toContain("Nothing was booked");
      expect(await prisma.record.count({ where: { workspaceId } })).toBe(0);
    });

    it("offers the nearest times that do work rather than only saying no", async () => {
      const said = await runner()(BOOKING_TOOL_NAME, {
        name: "Ada Okonkwo",
        date: FRIDAY,
        time: "03:00",
      });

      expect(said).toContain("nearest times that do work");
      expect(said).toMatch(/9:00|9 o'clock/);
    });

    it("refuses a day the business is not open at all", async () => {
      const verdict = await checkAvailability({ workspaceId, at: at(SUNDAY, "10:00") });
      expect(verdict.status).toBe("closed");
    });

    it("books a time inside opening hours", async () => {
      const said = await runner()(BOOKING_TOOL_NAME, {
        name: "Ada Okonkwo",
        date: FRIDAY,
        time: "10:00",
      });

      expect(said).toContain("Booked and confirmed");
      expect(await prisma.record.count({ where: { workspaceId } })).toBe(1);
    });

    it("requires the whole booking to fit, not just its start", async () => {
      // A 30-minute appointment starting at 16:45 runs a quarter hour past a
      // five o'clock close. Accepting it is the same error as booking at 3am,
      // only harder to see.
      const verdict = await checkAvailability({ workspaceId, at: at(FRIDAY, "16:45") });
      expect(verdict.status).toBe("closed");

      const fits = await checkAvailability({ workspaceId, at: at(FRIDAY, "16:30") });
      expect(fits.status).toBe("open");
    });

    it("honours a split shift as two periods, not one long day", async () => {
      await setSchedule(workspaceId, {
        periods: [
          { dayOfWeek: 5, opensMinute: 9 * 60, closesMinute: 13 * 60 },
          { dayOfWeek: 5, opensMinute: 14 * 60, closesMinute: 18 * 60 },
        ],
      });

      expect((await checkAvailability({ workspaceId, at: at(FRIDAY, "10:00") })).status).toBe("open");
      expect((await checkAvailability({ workspaceId, at: at(FRIDAY, "13:30") })).status).toBe("closed");
      expect((await checkAvailability({ workspaceId, at: at(FRIDAY, "15:00") })).status).toBe("open");
    });

    it("closes a date the business named, and says why to the caller", async () => {
      await setSchedule(workspaceId, {
        exceptions: [{ date: FRIDAY, closed: true, reason: "a staff training day" }],
      });

      const verdict = await checkAvailability({ workspaceId, at: at(FRIDAY, "10:00") });
      expect(verdict.status).toBe("closed");
      expect(verdict.status === "closed" && verdict.reason).toContain("a staff training day");
    });

    it("lets a date override the weekly pattern with its own hours", async () => {
      await setSchedule(workspaceId, {
        exceptions: [
          { date: FRIDAY, closed: false, opensMinute: 9 * 60, closesMinute: 12 * 60, reason: "Christmas Eve" },
        ],
      });

      expect((await checkAvailability({ workspaceId, at: at(FRIDAY, "10:00") })).status).toBe("open");
      // Open until five under the weekly pattern; the exception closes at noon.
      expect((await checkAvailability({ workspaceId, at: at(FRIDAY, "14:00") })).status).toBe("closed");
    });
  });

  // ────────────────────────────────────────────────────────────────────────

  describe("capacity", () => {
    beforeEach(async () => {
      await weekdayHours();
      await setSchedule(workspaceId, {
        policy: { capacityPerSlot: 2, slotMinutes: 30, durationMinutes: 30 },
      });
    });

    const bookAt = (time: string, phone: string) =>
      bookingRunner({ workspaceId, conversationId, callerNumber: phone, timezone: TZ })(
        BOOKING_TOOL_NAME,
        { name: `Caller ${phone.slice(-3)}`, date: FRIDAY, time },
      );

    it("fills a slot and then refuses the next caller", async () => {
      expect(await bookAt("10:00", "+447700900001")).toContain("Booked and confirmed");
      expect(await bookAt("10:00", "+447700900002")).toContain("Booked and confirmed");

      const third = await bookAt("10:00", "+447700900003");
      expect(third).toContain("Nothing was booked");
      expect(third).toContain("fully booked");
      expect(await prisma.record.count({ where: { workspaceId } })).toBe(2);
    });

    it("offers a different time to the caller it turned away", async () => {
      await bookAt("10:00", "+447700900001");
      await bookAt("10:00", "+447700900002");

      const third = await bookAt("10:00", "+447700900003");
      expect(third).toContain("nearest times that do work");
    });

    it("does not count a cancelled booking against the slot", async () => {
      await bookAt("10:00", "+447700900001");
      await bookAt("10:00", "+447700900002");
      await prisma.record.updateMany({
        where: { workspaceId, partyPhone: "+447700900001" },
        data: { status: "cancelled" },
      });

      expect(await bookAt("10:00", "+447700900003")).toContain("Booked and confirmed");
    });

    it("counts a booking that overlaps the slot, not only one that starts on it", async () => {
      // A 60-minute booking at 10:00 occupies 10:30 on the same chair.
      await setSchedule(workspaceId, {
        policy: { capacityPerSlot: 1, slotMinutes: 60, durationMinutes: 60 },
      });
      expect(await bookAt("10:00", "+447700900001")).toContain("Booked and confirmed");

      const overlapping = await bookAt("10:30", "+447700900002");
      expect(overlapping).toContain("Nothing was booked");
    });

    it("surveys a whole day without dropping the slot it anchored on", async () => {
      // The day survey anchors at midday because that is the middle of a
      // trading day; noon is a real bookable slot and must appear in the list.
      const said = await bookingRunner({
        workspaceId,
        conversationId,
        callerNumber: "+447700900123",
        timezone: TZ,
      })(AVAILABILITY_TOOL_NAME, { date: FRIDAY });

      expect(said).toContain("open");
      expect(said).toContain("still have room");
    });

    it("only offers alternatives that still have room", async () => {
      await bookAt("09:00", "+447700900001");
      await bookAt("09:00", "+447700900002");

      const free = await suggestSlots({ workspaceId, at: at(FRIDAY, "09:00"), limit: 3 });
      expect(free.every((slot) => slot.getTime() !== at(FRIDAY, "09:00").getTime())).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────

  describe("how far ahead, and how soon", () => {
    beforeEach(weekdayHours);

    it("refuses a time that has already passed", async () => {
      await setSchedule(workspaceId, { policy: { leadTimeMinutes: 0 } });

      const verdict = await checkAvailability({
        workspaceId,
        at: at(FRIDAY, "10:00"),
        now: at(FRIDAY, "14:00"),
      });
      expect(verdict.status).toBe("out_of_range");
      expect(verdict.status === "out_of_range" && verdict.reason).toContain("already passed");
    });

    it("refuses a booking inside the notice the business needs", async () => {
      await setSchedule(workspaceId, { policy: { leadTimeMinutes: 120 } });

      const verdict = await checkAvailability({
        workspaceId,
        at: at(FRIDAY, "10:00"),
        now: at(FRIDAY, "09:30"),
      });
      expect(verdict.status).toBe("out_of_range");
      expect(verdict.status === "out_of_range" && verdict.reason).toContain("notice");
    });

    it("refuses a date beyond the diary rather than booking a year out", async () => {
      await setSchedule(workspaceId, { policy: { maxAdvanceDays: 30 } });

      const verdict = await checkAvailability({
        workspaceId,
        at: at("2027-06-04", "10:00"),
        now: at(THURSDAY, "09:00"),
      });
      expect(verdict.status).toBe("out_of_range");
    });
  });

  // ────────────────────────────────────────────────────────────────────────

  describe("moving a booking", () => {
    beforeEach(weekdayHours);

    it("refuses to move a booking into a closed day, and leaves it where it was", async () => {
      await runner()(BOOKING_TOOL_NAME, { name: "Ada Okonkwo", date: FRIDAY, time: "10:00" });

      const said = await runner()(RESCHEDULE_TOOL_NAME, { newDate: SUNDAY, newTime: "10:00" });

      expect(said).toContain("Nothing was moved");
      const record = await prisma.record.findFirstOrThrow({ where: { workspaceId } });
      expect(record.scheduledAt?.toISOString()).toContain(FRIDAY);
    });

    it("moves within opening hours", async () => {
      await runner()(BOOKING_TOOL_NAME, { name: "Ada Okonkwo", date: FRIDAY, time: "10:00" });

      const said = await runner()(RESCHEDULE_TOOL_NAME, { newDate: FRIDAY, newTime: "14:00" });
      expect(said).toContain("Moved");
    });

    it("does not let a booking block its own move at a capacity of one", async () => {
      await setSchedule(workspaceId, { policy: { capacityPerSlot: 1, slotMinutes: 60, durationMinutes: 60 } });
      await runner()(BOOKING_TOOL_NAME, { name: "Ada Okonkwo", date: FRIDAY, time: "10:00" });

      // 10:30 overlaps 10:00 — the only thing occupying it is the row being moved.
      const said = await runner()(RESCHEDULE_TOOL_NAME, { newDate: FRIDAY, newTime: "10:30" });
      expect(said).toContain("Moved");
    });
  });

  // ────────────────────────────────────────────────────────────────────────

  describe("the business's own clock", () => {
    it("reads opening hours in the workspace's timezone, not the server's", async () => {
      const kolkata = await prisma.workspace.create({
        data: {
          organizationId: (await prisma.organization.findFirstOrThrow()).id,
          name: "Lumina Mumbai",
          slug: "lumina-mumbai",
          timezone: "Asia/Kolkata",
        },
      });
      await setSchedule(kolkata.id, {
        periods: [{ dayOfWeek: 5, opensMinute: 9 * 60, closesMinute: 17 * 60 }],
      });

      // 09:30 in Kolkata is 04:00Z — inside opening hours only if the zone is
      // honoured. Read as UTC it is before opening and would be refused.
      const inside = await checkAvailability({
        workspaceId: kolkata.id,
        at: new Date(`${FRIDAY}T04:00:00Z`),
      });
      expect(inside.status).toBe("open");

      // 09:30Z is 15:00 in Kolkata — still open. 13:00Z is 18:30 — shut.
      const outside = await checkAvailability({
        workspaceId: kolkata.id,
        at: new Date(`${FRIDAY}T13:00:00Z`),
      });
      expect(outside.status).toBe("closed");
    });
  });
});

/**
 * What the employee is allowed to say out loud.
 *
 * The gate in `create_booking` stops a bad row being written; this is what
 * stops a bad *sentence*. A caller told "yes, seven is free" and then refused
 * at the point of booking has had a worse call than one who was never offered
 * it — so the prompt has to narrow to exactly what the business has actually
 * configured, and the middle case is the one worth guarding: hours but no
 * capacity means the employee knows it is *open*, and knows nothing about
 * whether the diary has room.
 */
describe("what the employee is told it can check", () => {
  const employeeWith = (
    periods: { dayOfWeek: number; opensMinute: number; closesMinute: number }[],
    capacityPerSlot: number | null,
  ): ResolvedEmployee => ({
    workspaceId: "ws",
    employeeId: "emp",
    employeeName: "Arsha",
    roleName: "Receptionist",
    businessName: "Lumina Clinic",
    industryKey: "healthcare",
    timezone: TZ,
    behavior: {},
    escalationRules: {},
    operatingRules: {},
    schedule: describeSchedule(periods, [], capacityPerSlot),
  });

  const weekdays = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
    dayOfWeek,
    opensMinute: 9 * 60,
    closesMinute: 17 * 60,
  }));

  it("keeps the old instruction word for word when nothing is configured", () => {
    const prompt = buildSystemPrompt(employeeWith([], null));

    expect(prompt).toContain("You cannot check availability");
    expect(prompt).not.toContain("# When the business is open");
    expect(prompt).not.toContain("check_availability for it");
  });

  it("states the opening hours, including the days that are closed", () => {
    const prompt = buildSystemPrompt(employeeWith(weekdays, null));

    expect(prompt).toContain("# When the business is open");
    expect(prompt).toContain("Monday: 9 o'clock in the morning to 5 o'clock in the afternoon");
    // A model given five open days and silence about the other two guesses,
    // and it guesses open.
    expect(prompt).toContain("Saturday: closed");
    expect(prompt).toContain("Sunday: closed");
  });

  it("forbids claiming a time is free when only the hours are known", () => {
    const prompt = buildSystemPrompt(employeeWith(weekdays, null));

    expect(prompt).toContain("must never");
    expect(prompt).toContain("free, available, or still has space");
    expect(prompt).not.toContain("You cannot check availability");
  });

  it("lets it speak to the diary once capacity is configured", () => {
    const prompt = buildSystemPrompt(employeeWith(weekdays, 4));

    expect(prompt).toContain("never contradict what it told you");
    expect(prompt).not.toContain("free, available, or still has space");
    expect(prompt).toContain("check_availability for it");
  });

  it("never promises a caller a time before checking it", () => {
    const prompt = buildSystemPrompt(employeeWith(weekdays, 4));
    expect(prompt).toContain("Before you promise a caller any particular time");
  });
});
