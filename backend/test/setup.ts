import { execSync } from "node:child_process";
import { beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { seedRolesAndPermissions } from "../src/lib/roles-seed.js";

/**
 * Hard guard, not a formality. `.env.test` is loaded via `NODE_OPTIONS=
 * --env-file=.env.test` in `package.json`'s test script — set at the Node
 * process level, before any module (including this one) evaluates, which is
 * the part that actually matters: a `process.loadEnvFile()` call sitting
 * inside this file would run *after* ESM's hoisted `import` statements below
 * (including `../src/db/client.js`, which reads `DATABASE_URL` at import
 * time), landing too late to affect anything. That exact mistake once sent
 * this suite's `beforeEach` truncation against the dev database instead of
 * the test one. This assertion is what makes sure it can only ever happen
 * once — if `DATABASE_URL` doesn't unambiguously say "test", every
 * destructive call below refuses to run.
 */
if (!process.env.DATABASE_URL?.includes("humanoid_test")) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL does not look like the test database ` +
      `(got ${JSON.stringify(process.env.DATABASE_URL)}). Run tests via "pnpm test", ` +
      `which sets NODE_OPTIONS=--env-file=.env.test.`,
  );
}

beforeAll(() => {
  // Keeps the test database's schema in sync with `prisma/schema.prisma`
  // without ever generating a new migration file from a test run.
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "inherit",
    env: process.env,
    cwd: new URL("..", import.meta.url).pathname,
  });
});

/**
 * A truncate-and-reseed between every test, not per file — `fileParallelism:
 * false` in `vitest.config.ts` makes that safe against one shared Postgres
 * database, and it's the difference between "the last test in a file leaks
 * state into the first test of the next" and not.
 */
beforeEach(async () => {
  await prisma.$transaction([
    prisma.auditEvent.deleteMany(),
    prisma.onboardingAnswer.deleteMany(),
    prisma.onboardingSession.deleteMany(),
    prisma.aiEmployeeConfigurationVersion.deleteMany(),
    prisma.aiEmployee.deleteMany(),
    prisma.workspaceMembership.deleteMany(),
    prisma.workspace.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.otpCode.deleteMany(),
    prisma.user.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.role.deleteMany(),
    prisma.permission.deleteMany(),
  ]);
  await seedRolesAndPermissions(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});
