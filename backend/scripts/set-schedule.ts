/**
 * Tells a workspace when it is open, and how much fits in a slot.
 *
 * Nothing in the application writes this yet: onboarding does not ask for
 * opening hours, and `/govern/channels` — the surface that will own them — is
 * still reading mock data. A half-built editor would be worse than a
 * deliberate manual step, so this is the deliberate manual step.
 *
 * The thing it exists to make hard to get wrong: a workspace with no schedule
 * books anything at any hour, which is what every tenant does today and must
 * go on doing. So this never writes a partial schedule silently — it prints
 * what a workspace will actually enforce after the change, including the
 * checks that still are not running.
 *
 *   pnpm --filter ./backend schedule:set                              # show everyone
 *   pnpm --filter ./backend schedule:set Kims                         # show one
 *   pnpm --filter ./backend schedule:set Kims "mon-fri 9-17, sat 10-14"
 *   pnpm --filter ./backend schedule:set Kims --capacity 4 --duration 30
 *   pnpm --filter ./backend schedule:set Kims --closed 2026-12-25 "Christmas Day"
 *   pnpm --filter ./backend schedule:set Kims --clear
 *
 * The workspace is named by id or by an exact, case-insensitive name.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Period = { dayOfWeek: number; opensMinute: number; closesMinute: number };

/**
 * `mon-fri 9-17, sat 10:30-14` into periods.
 *
 * Deliberately forgiving about how a time is written and deliberately strict
 * about what it means: `17` is five in the afternoon, never five past one, and
 * a range that does not close after it opens is refused rather than stored
 * upside down.
 */
function parseHours(spec: string): Period[] {
  const periods: Period[] = [];

  for (const clause of spec.split(",").map((c) => c.trim()).filter(Boolean)) {
    const match = /^([a-z]+)(?:\s*-\s*([a-z]+))?\s+(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?$/i.exec(
      clause,
    );
    if (!match) throw new Error(`Could not read "${clause}". Try something like "mon-fri 9-17".`);

    const [, fromDay, toDay, openH, openM, closeH, closeM] = match;
    const start = DAYS[fromDay!.toLowerCase()];
    const end = toDay ? DAYS[toDay.toLowerCase()] : start;
    if (start === undefined || end === undefined) throw new Error(`Unknown day in "${clause}".`);

    const opensMinute = Number(openH) * 60 + Number(openM ?? 0);
    const closesMinute = Number(closeH) * 60 + Number(closeM ?? 0);
    if (closesMinute <= opensMinute) {
      throw new Error(`"${clause}" closes before it opens. For a late night use 25-30 style hours.`);
    }

    // `sat-mon` wraps the week rather than being an error: a business open at
    // the weekend and on Monday says it that way.
    for (let i = 0; i <= (end - start + 7) % 7; i += 1) {
      periods.push({ dayOfWeek: (start + i) % 7, opensMinute, closesMinute });
    }
  }

  return periods;
}

function clock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

async function show(workspaceId: string): Promise<void> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: {
      name: true,
      timezone: true,
      businessHours: { orderBy: [{ dayOfWeek: "asc" }, { opensMinute: "asc" }] },
      scheduleExceptions: { orderBy: { date: "asc" } },
      bookingPolicy: true,
    },
  });

  console.log(`\n${workspace.name}  (${workspace.timezone})`);

  if (workspace.businessHours.length === 0) {
    console.log("  hours     not set — the employee will book any time on any day");
  } else {
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      const day = workspace.businessHours.filter((h) => h.dayOfWeek === dayOfWeek);
      const text = day.length === 0 ? "closed" : day.map((h) => `${clock(h.opensMinute)}-${clock(h.closesMinute)}`).join(", ");
      console.log(`  ${DAY_NAMES[dayOfWeek]!.padEnd(10)}${text}`);
    }
  }

  for (const e of workspace.scheduleExceptions) {
    const text = e.closed
      ? "closed"
      : e.opensMinute != null && e.closesMinute != null
        ? `${clock(e.opensMinute)}-${clock(e.closesMinute)}`
        : "open as usual";
    console.log(`  ${e.date}  ${text}${e.reason ? `  (${e.reason})` : ""}`);
  }

  const policy = workspace.bookingPolicy;
  if (!policy) {
    console.log("  capacity  not set — nothing checks how full the diary is");
  } else {
    console.log(
      `  capacity  ${policy.capacityPerSlot ?? "not set"} per ${policy.slotMinutes}-minute slot, ` +
        `${policy.durationMinutes}-minute bookings, ${policy.leadTimeMinutes} minutes notice, ` +
        `${policy.maxAdvanceDays} days ahead`,
    );
  }

  // The honest summary. Both of these can be false after a successful write,
  // and a business that thinks it has set opening hours when it has only set
  // capacity would find out from a caller booked at four in the morning.
  console.log(
    `  → enforcing: hours ${workspace.businessHours.length > 0 ? "yes" : "NO"}, ` +
      `capacity ${policy?.capacityPerSlot != null ? "yes" : "NO"}`,
  );
}

async function findWorkspace(target: string): Promise<{ id: string; name: string }> {
  const found = await prisma.workspace.findFirst({
    where: { OR: [{ id: target }, { name: { equals: target, mode: "insensitive" } }] },
    select: { id: true, name: true },
  });
  if (!found) throw new Error(`No workspace called "${target}".`);
  return found;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    const all = await prisma.workspace.findMany({ select: { id: true }, orderBy: { name: "asc" } });
    if (all.length === 0) console.log("No workspaces yet.");
    for (const w of all) await show(w.id);
    return;
  }

  const workspace = await findWorkspace(argv[0]!);
  const rest = argv.slice(1);

  if (rest.length === 0) return show(workspace.id);

  const { setSchedule } = await import("../src/modules/schedule/schedule.service.js");

  if (rest[0] === "--clear") {
    await setSchedule(workspace.id, { periods: [], exceptions: [] });
    await prisma.bookingPolicy.deleteMany({ where: { workspaceId: workspace.id } });
    console.log(`Cleared ${workspace.name}'s schedule — it will book any time again.`);
    return show(workspace.id);
  }

  const flag = (name: string): string | undefined => {
    const i = rest.indexOf(`--${name}`);
    return i === -1 ? undefined : rest[i + 1];
  };

  const closedDate = flag("closed");
  if (closedDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(closedDate)) throw new Error("--closed takes a YYYY-MM-DD date.");
    const existing = await prisma.scheduleException.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { date: "asc" },
    });
    // Exceptions are replaced wholesale by `setSchedule`, so the existing ones
    // are read back and passed through — adding one closure must not silently
    // delete the other eleven.
    await setSchedule(workspace.id, {
      exceptions: [
        ...existing
          .filter((e) => e.date !== closedDate)
          .map((e) => ({
            date: e.date,
            closed: e.closed,
            opensMinute: e.opensMinute,
            closesMinute: e.closesMinute,
            reason: e.reason,
          })),
        { date: closedDate, closed: true, reason: rest[rest.indexOf("--closed") + 2] ?? null },
      ],
    });
    return show(workspace.id);
  }

  const policy: Record<string, number | null> = {};
  const capacity = flag("capacity");
  if (capacity !== undefined) policy.capacityPerSlot = capacity === "none" ? null : Number(capacity);
  if (flag("slot")) policy.slotMinutes = Number(flag("slot"));
  if (flag("duration")) policy.durationMinutes = Number(flag("duration"));
  if (flag("lead")) policy.leadTimeMinutes = Number(flag("lead"));
  if (flag("advance")) policy.maxAdvanceDays = Number(flag("advance"));

  // Anything not starting with `--` is the hours spec.
  const hoursSpec = rest.find((arg) => !arg.startsWith("--") && !isFlagValue(rest, arg));

  await setSchedule(workspace.id, {
    ...(hoursSpec ? { periods: parseHours(hoursSpec) } : {}),
    ...(Object.keys(policy).length > 0 ? { policy } : {}),
  });

  return show(workspace.id);
}

/** True when this argument is the value of a `--flag` rather than the hours. */
function isFlagValue(argv: string[], arg: string): boolean {
  const i = argv.indexOf(arg);
  return i > 0 && argv[i - 1]!.startsWith("--");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
