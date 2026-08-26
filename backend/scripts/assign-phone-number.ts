/**
 * Points a Twilio line at a workspace — the one thing that decides which
 * tenant's AI employee answers a call.
 *
 * `workspaces.phone_number` is written by nothing in the application:
 * onboarding creates a workspace and an employee but never claims a number,
 * because provisioning numbers is its own feature and a half-built endpoint
 * would be worse than a deliberate manual step. That manual step was a raw
 * UPDATE, which is easy to get wrong in the two ways that matter — the column
 * is unique, so assigning a number another workspace already holds fails with
 * a constraint error rather than moving it; and a workspace with no configured
 * employee accepts the number happily and then falls through to a *different*
 * tenant at call time. Both faults are silent until a real call answers as the
 * wrong business.
 *
 *   pnpm --filter ./backend phone:assign                       # show who owns what
 *   pnpm --filter ./backend phone:assign Kims +19044909120     # claim the line
 *   pnpm --filter ./backend phone:assign Kims --clear          # release it
 *
 * The workspace is named by id or by an exact, case-insensitive name.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Twilio speaks E.164 and the lookup is an exact string match, so a number
 *  stored as `9044909120` or `(904) 490-9120` simply never routes. */
const E164 = /^\+[1-9]\d{1,14}$/;

type WorkspaceRow = {
  id: string;
  name: string;
  phoneNumber: string | null;
  aiEmployees: { name: string; currentConfigurationVersionId: string | null }[];
};

const SELECT = {
  id: true,
  name: true,
  phoneNumber: true,
  aiEmployees: { select: { name: true, currentConfigurationVersionId: true } },
} as const;

async function main(): Promise<void> {
  const [target, number] = process.argv.slice(2);

  if (!target) {
    await printAssignments();
    return;
  }

  const workspace = await findWorkspace(target);
  if (!workspace) {
    fail(`No workspace matches "${target}". Run with no arguments to list them.`);
  }

  if (number === "--clear") {
    await prisma.workspace.update({ where: { id: workspace.id }, data: { phoneNumber: null } });
    console.log(`Released ${workspace.phoneNumber ?? "(no number)"} from ${workspace.name}.`);
    console.log("Calls to it now fall through to AI_EMPLOYEE_WORKSPACE_ID, or to the most recently configured employee anywhere.");
    return;
  }

  if (!number) {
    fail(`Usage: phone:assign <workspace id or name> <+E164 number | --clear>`);
  }

  if (!E164.test(number)) {
    fail(`"${number}" is not E.164. Twilio sends the number in E.164 and the lookup is an exact match, so it must be written +<country><number> — e.g. +19044909120.`);
  }

  // A workspace with no *configured* employee takes the number and then routes
  // nowhere: resolveEmployeeForCall() logs "assigned to a workspace with no
  // configured AI employee" and falls through to another tenant.
  const configured = workspace.aiEmployees.filter((e) => e.currentConfigurationVersionId !== null);
  if (configured.length === 0) {
    fail(
      `${workspace.name} has no AI employee with a current configuration version, so it cannot answer. ` +
        `Finish onboarding for that workspace first — otherwise the call falls through to a different tenant.`,
    );
  }

  const currentOwner = await prisma.workspace.findUnique({ where: { phoneNumber: number }, select: SELECT });

  if (currentOwner && currentOwner.id === workspace.id) {
    console.log(`${workspace.name} already owns ${number}. Nothing to do.`);
    return;
  }

  // The column is unique, so a move is genuinely a handover: whoever holds the
  // number loses the line. Doing both writes in one transaction means there is
  // no instant where the number is unowned and a call would answer as a
  // fallback tenant.
  await prisma.$transaction(async (tx) => {
    if (currentOwner) {
      await tx.workspace.update({ where: { id: currentOwner.id }, data: { phoneNumber: null } });
    }
    await tx.workspace.update({ where: { id: workspace.id }, data: { phoneNumber: number } });
  });

  if (currentOwner) {
    console.log(`Moved ${number} from ${currentOwner.name} to ${workspace.name}.`);
    console.log(`${currentOwner.name} no longer answers any line.`);
  } else {
    console.log(`Assigned ${number} to ${workspace.name}.`);
  }
  console.log(`Answering as: ${configured.map((e) => e.name).join(", ")}`);
}

/** Id first, then an exact case-insensitive name — a name is what a human has
 *  to hand, an id is what is unambiguous. */
async function findWorkspace(target: string): Promise<WorkspaceRow | null> {
  const byId = await prisma.workspace.findUnique({ where: { id: target }, select: SELECT });
  if (byId) return byId;

  const byName = await prisma.workspace.findMany({
    where: { name: { equals: target, mode: "insensitive" } },
    select: SELECT,
  });

  if (byName.length > 1) {
    fail(
      `"${target}" matches ${byName.length} workspaces. Use an id:\n` +
        byName.map((w) => `  ${w.id}  ${w.name}`).join("\n"),
    );
  }

  return byName[0] ?? null;
}

async function printAssignments(): Promise<void> {
  const workspaces = await prisma.workspace.findMany({ select: SELECT, orderBy: { createdAt: "asc" } });

  console.log("\nWhich workspace answers which line:\n");
  for (const w of workspaces) {
    const configured = w.aiEmployees.filter((e) => e.currentConfigurationVersionId !== null);
    const employees = configured.length > 0 ? configured.map((e) => e.name).join(", ") : "no configured employee";
    console.log(`  ${(w.phoneNumber ?? "—").padEnd(16)}  ${w.name.padEnd(24)}  ${employees}`);
    console.log(`  ${" ".repeat(16)}  ${w.id}`);
  }
  console.log("\nAssign with:  pnpm --filter ./backend phone:assign <workspace id or name> +19044909120\n");
}

function fail(message: string): never {
  console.error(message);
  process.exitCode = 1;
  void prisma.$disconnect();
  process.exit(1);
}

await main();
await prisma.$disconnect();
