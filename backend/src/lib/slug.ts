import { randomBytes } from "node:crypto";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "workspace";
}

/** Appends a short random suffix — cheap collision avoidance without a
 *  read-check-write race against the unique constraint. */
export function slugWithSuffix(base: string): string {
  return `${slugify(base)}-${randomBytes(3).toString("hex")}`;
}
