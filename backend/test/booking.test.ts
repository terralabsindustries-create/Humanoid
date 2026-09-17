import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/db/client.js";
import {
  bookingRunner,
  bookingTool,
  bookingTools,
  BOOKING_TOOL_NAME,
  CANCEL_TOOL_NAME,
  FIND_BOOKINGS_TOOL_NAME,
  RESCHEDULE_TOOL_NAME,
} from "../src/modules/telephony/booking-tool.js";

/**
 * The employee's first write to the business itself.
 *
 * Everything before this produced a transcript; this produces a booking staff
 * will act on. The tests that matter are the ones about *not* writing: a
 * missing name, an unusable date, and — most importantly — a workspace the
 * model tried to name itself.
 */
describe("booking tool", () => {
  let workspaceId: string;
  let conversationId: string;

  beforeEach(async () => {
    const org = await prisma.organization.create({ data: { name: "Lumina", slug: "lumina" } });
    const workspace = await prisma.workspace.create({
      data: { organizationId: org.id, name: "Lumina Hotel", slug: "lumina-hotel" },
    });
    workspaceId = workspace.id;

    const conversation = await prisma.conversation.create({
      data: { workspaceId, channelType: "voice", direction: "inbound", status: "active" },
    });
    conversationId = conversation.id;
  });

  const runnerIn = (timezone: string) =>
    bookingRunner({
      workspaceId,
      conversationId,
      callerNumber: "+919044909120",
      timezone,
    });

  const runner = () => runnerIn("Asia/Kolkata");

  it("creates a confirmed booking linked to the call that produced it", async () => {
    const said = await runner()(BOOKING_TOOL_NAME, {
      name: "Priya Raman",
      date: "2026-09-04",
      time: "20:00",
      partySize: 4,
      notes: "Window table",
    });

    const record = await prisma.record.findFirstOrThrow({ where: { workspaceId } });
    expect(record.status).toBe("confirmed");
    expect(record.partyName).toBe("Priya Raman");
    expect(record.partyPhone).toBe("+919044909120");
    expect(record.conversationId).toBe(conversationId);
    expect(record.scheduledAt?.toISOString()).toContain("2026-09-04");
    expect(record.fieldsJson).toMatchObject({ partySize: 4, notes: "Window table" });

    // What the model is told steers what the caller then hears.
    expect(said.toLowerCase()).toContain("confirmed");
  });

  it("writes only to the call's own tenant, whatever the model claims", async () => {
    const other = await prisma.organization.create({ data: { name: "Rival", slug: "rival" } });
    const otherWorkspace = await prisma.workspace.create({
      data: { organizationId: other.id, name: "Rival Hotel", slug: "rival-hotel" },
    });

    // A hallucinated workspace id in the arguments must be inert.
    await runner()(BOOKING_TOOL_NAME, {
      name: "Priya",
      date: "2026-09-04",
      time: "20:00",
      workspaceId: otherWorkspace.id,
    });

    expect(await prisma.record.count({ where: { workspaceId: otherWorkspace.id } })).toBe(0);
    expect(await prisma.record.count({ where: { workspaceId } })).toBe(1);
  });

  it("refuses to book without a name, and says why", async () => {
    const said = await runner()(BOOKING_TOOL_NAME, { date: "2026-09-04", time: "20:00" });
    expect(await prisma.record.count()).toBe(0);
    expect(said.toLowerCase()).toContain("name");
  });

  it("refuses an unusable date rather than inventing one", async () => {
    // "tomorrow" is exactly what a model reaches for when it has no clock.
    const said = await runner()(BOOKING_TOOL_NAME, { name: "Priya", date: "tomorrow", time: "20:00" });
    expect(await prisma.record.count()).toBe(0);
    expect(said.toLowerCase()).toContain("date");
  });

  it("still books when only a date and time are given", async () => {
    await runner()(BOOKING_TOOL_NAME, { name: "Priya", date: "2026-09-04", time: "9:30" });
    const record = await prisma.record.findFirstOrThrow();
    // Asserted as an instant, never with getHours(): that reads the stored
    // time back through the *process* clock, so it agreed with the tenant's
    // zone only on a machine that happened to share its offset — which is the
    // same assumption the bug below was made of.
    expect(record.scheduledAt?.toISOString()).toBe("2026-09-04T04:00:00.000Z");
  });

  it("reports an unknown tool instead of throwing into the call", async () => {
    const said = await runner()("delete_everything", {});
    expect(said).toContain("delete_everything");
    expect(await prisma.record.count()).toBe(0);
  });

  /**
   * A caller says a time; the business keeps a clock. These say the two are
   * the same clock, and that neither depends on where the server runs.
   *
   * The bug they exist for: the wall clock was parsed with no offset, which
   * the language defines as the *Node process's* local time. A booking taken
   * for 23:00 at a Europe/London business, on a laptop in Asia/Kolkata, was
   * stored as 17:30Z and shown to staff as 18:30 — while the employee had
   * just confirmed "eleven p.m." aloud to the caller.
   */
  describe("resolves the caller's wall clock in the business's timezone", () => {
    const scheduledAt = async () =>
      (await prisma.record.findFirstOrThrow()).scheduledAt?.toISOString();

    it("stores the time the caller was promised, not the server's reading of it", async () => {
      await runnerIn("Europe/London")(BOOKING_TOOL_NAME, {
        name: "Albert Haddin",
        date: "2026-08-26",
        time: "23:00",
      });
      // 23:00 BST. Not 17:30Z (read as Asia/Kolkata) and not 23:00Z (read as UTC).
      expect(await scheduledAt()).toBe("2026-08-26T22:00:00.000Z");
    });

    it("follows the zone across a DST change rather than a fixed offset", async () => {
      // The same clock time and the same business, in GMT rather than BST.
      await runnerIn("Europe/London")(BOOKING_TOOL_NAME, {
        name: "Albert Haddin",
        date: "2026-01-15",
        time: "23:00",
      });
      expect(await scheduledAt()).toBe("2026-01-15T23:00:00.000Z");
    });

    it("crosses midnight in the zone that owns the booking", async () => {
      // 23:00 EDT is the next calendar day in UTC — the case where storing a
      // naive date would put the booking on the wrong day entirely.
      await runnerIn("America/New_York")(BOOKING_TOOL_NAME, {
        name: "Albert Haddin",
        date: "2026-08-26",
        time: "23:00",
      });
      expect(await scheduledAt()).toBe("2026-08-27T03:00:00.000Z");
    });

    it("refuses a clock time that is not a real time", async () => {
      const said = await runnerIn("Europe/London")(BOOKING_TOOL_NAME, {
        name: "Albert Haddin",
        date: "2026-08-26",
        time: "25:00",
      });
      expect(await prisma.record.count()).toBe(0);
      expect(said.toLowerCase()).toContain("time");
    });

    it("falls back to UTC on an unrecognised zone instead of the process clock", async () => {
      await runnerIn("Mars/Olympus_Mons")(BOOKING_TOOL_NAME, {
        name: "Albert Haddin",
        date: "2026-08-26",
        time: "23:00",
      });
      // Wrong, but wrong identically on every machine — and it still books,
      // because dropping a caller's booking over a bad config row is worse.
      expect(await scheduledAt()).toBe("2026-08-26T23:00:00.000Z");
    });
  });

  it("describes itself in industry-neutral terms", () => {
    // Industry words belong in the frontend's domain packs (rule 10). If the
    // backend starts saying "reservation", one tenant's language has leaked
    // into every tenant's prompt.
    const described = bookingTools
      .map((tool) => `${tool.name} ${tool.description}`)
      .join(" ")
      .toLowerCase();
    expect(described).not.toContain("reservation");
    expect(described).not.toContain("appointment");
    expect(bookingTool.parameters).toMatchObject({ required: ["name", "date", "time"] });
  });
});

/**
 * Changing a booking that already exists.
 *
 * Without these tools the employee had exactly one action available, so a
 * caller ringing back to move Thursday to Friday got a *second* booking and
 * the first stayed confirmed — two tables held for one party, with nothing in
 * the transcript to suggest anything went wrong. Every test here is about the
 * row count as much as the row.
 */
describe("changing a booking the caller already has", () => {
  let workspaceId: string;
  let conversationId: string;

  const CALLER = "+919044909120";
  const TIMEZONE = "Asia/Kolkata";

  /** Dates relative to now, so the suite does not expire on a calendar date. */
  const inDays = (days: number): string =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  beforeEach(async () => {
    const org = await prisma.organization.create({ data: { name: "Lumina", slug: "lumina" } });
    const workspace = await prisma.workspace.create({
      data: { organizationId: org.id, name: "Lumina Hotel", slug: "lumina-hotel" },
    });
    workspaceId = workspace.id;

    const conversation = await prisma.conversation.create({
      data: { workspaceId, channelType: "voice", direction: "inbound", status: "active" },
    });
    conversationId = conversation.id;
  });

  const runnerFor = (callerNumber: string | null) =>
    bookingRunner({ workspaceId, conversationId, callerNumber, timezone: TIMEZONE });

  const runner = () => runnerFor(CALLER);

  const book = (name: string, date: string, time: string) =>
    runner()(BOOKING_TOOL_NAME, { name, date, time });

  const bookings = () =>
    prisma.record.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });

  it("moves the booking instead of leaving the old one behind", async () => {
    await book("Asha", inDays(3), "10:00");

    const said = await runner()(RESCHEDULE_TOOL_NAME, {
      newDate: inDays(4),
      newTime: "19:30",
    });

    const rows = await bookings();
    // The entire point: one row, moved — not one cancelled and one created,
    // and certainly not two live bookings.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("confirmed");
    expect(rows[0]!.scheduledAt?.toISOString()).toBe(
      new Date(`${inDays(4)}T14:00:00.000Z`).toISOString(),
    );
    // Where it came from is kept, because "why is this at seven thirty now?"
    // is a question the business will ask.
    expect(rows[0]!.fieldsJson).toMatchObject({ rescheduledBy: "ai_employee" });
    expect(said.toLowerCase()).toContain("moved");
  });

  it("cancels by marking the booking, not by deleting it", async () => {
    await book("Asha", inDays(3), "10:00");

    const said = await runner()(CANCEL_TOOL_NAME, { reason: "no longer needed" });

    const rows = await bookings();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("cancelled");
    expect(rows[0]!.fieldsJson).toMatchObject({
      cancelledBy: "ai_employee",
      cancellationReason: "no longer needed",
    });
    expect(said.toLowerCase()).toContain("cancelled");
  });

  it("asks which one rather than guessing, when the caller has two", async () => {
    await book("Asha", inDays(3), "10:00");
    await book("Asha", inDays(5), "22:00");

    const said = await runner()(CANCEL_TOOL_NAME, {});

    // A near miss on a time is far more likely to be a mis-transcription than
    // a second booking, so nothing is touched until the caller settles it.
    const rows = await bookings();
    expect(rows.every((r) => r.status === "confirmed")).toBe(true);
    expect(said.toLowerCase()).toContain("more than one");
  });

  it("acts on the one the caller named, when they name it", async () => {
    await book("Asha", inDays(3), "10:00");
    await book("Asha", inDays(5), "22:00");

    await runner()(CANCEL_TOOL_NAME, { date: inDays(5), time: "22:00" });

    const rows = await bookings();
    const cancelled = rows.filter((r) => r.status === "cancelled");
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]!.scheduledAt?.toISOString()).toContain("T16:30");
  });

  it("reads back what the caller actually has, rather than acting on a wrong time", async () => {
    await book("Asha", inDays(3), "10:00");

    const said = await runner()(RESCHEDULE_TOOL_NAME, {
      newDate: inDays(6),
      newTime: "12:00",
      currentDate: inDays(3),
      currentTime: "09:00",
    });

    const rows = await bookings();
    expect(rows[0]!.scheduledAt?.toISOString()).toContain("T04:30");
    expect(said.toLowerCase()).toContain("no booking at that time");
  });

  it("does not write a second identical booking for the same slot", async () => {
    await book("Asha", inDays(3), "10:00");
    const said = await book("Asha", inDays(3), "10:00");

    expect(await bookings()).toHaveLength(1);
    expect(said.toLowerCase()).toContain("already booked");
  });

  it("tells the employee about the booking the caller already had", async () => {
    await book("Asha", inDays(3), "10:00");
    const said = await book("Asha", inDays(4), "19:00");

    // Two bookings is legitimate — a caller may want both — so this is a
    // prompt to check, not a refusal. It is the safety net under the model
    // reaching for create_booking when the caller meant to move one.
    expect(await bookings()).toHaveLength(2);
    expect(said).toContain("also already has");
    expect(said).toContain(RESCHEDULE_TOOL_NAME);
  });

  it("finds nothing for a withheld number, and changes nothing", async () => {
    await book("Asha", inDays(3), "10:00");

    const said = await runnerFor("anonymous")(CANCEL_TOOL_NAME, {});

    const rows = await bookings();
    expect(rows[0]!.status).toBe("confirmed");
    expect(said.toLowerCase()).toContain("withheld");
  });

  it("never reaches another tenant's booking on the same number", async () => {
    const other = await prisma.organization.create({ data: { name: "Rival", slug: "rival" } });
    const otherWorkspace = await prisma.workspace.create({
      data: { organizationId: other.id, name: "Rival Hotel", slug: "rival-hotel" },
    });
    await prisma.record.create({
      data: {
        workspaceId: otherWorkspace.id,
        archetype: "visit",
        typeId: "booking",
        status: "confirmed",
        partyName: "Asha",
        partyPhone: CALLER,
        scheduledAt: new Date(Date.now() + 3 * 86_400_000),
      },
    });

    const said = await runner()(CANCEL_TOOL_NAME, {});

    const theirs = await prisma.record.findFirstOrThrow({
      where: { workspaceId: otherWorkspace.id },
    });
    expect(theirs.status).toBe("confirmed");
    expect(said.toLowerCase()).toContain("no upcoming bookings");
  });

  it("does not offer a booking that has already happened", async () => {
    await prisma.record.create({
      data: {
        workspaceId,
        archetype: "visit",
        typeId: "booking",
        status: "confirmed",
        partyName: "Asha",
        partyPhone: CALLER,
        scheduledAt: new Date(Date.now() - 86_400_000),
      },
    });

    const said = await runner()(FIND_BOOKINGS_TOOL_NAME, {});
    expect(said.toLowerCase()).toContain("no upcoming bookings");
  });

  it("reads a caller's bookings back without touching them", async () => {
    await book("Asha", inDays(3), "10:00");

    const said = await runner()(FIND_BOOKINGS_TOOL_NAME, {});

    expect(said).toContain("Asha");
    expect(said.toLowerCase()).toContain("do not read out any reference number");
    expect((await bookings())[0]!.status).toBe("confirmed");
  });
});
