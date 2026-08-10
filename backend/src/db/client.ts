import { PrismaClient } from "@prisma/client";
import { env } from "@/config/env.js";

/**
 * One client per process. `tsx watch` reloads the module graph on file
 * change, so this guards against exhausting Postgres connections in dev the
 * same way the Next.js docs recommend for `next dev`.
 */
declare global {
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
