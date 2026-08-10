import { randomInt, createHash } from "node:crypto";

/** Six digits, generated with a CSPRNG — not `Math.random()`. */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * OTP codes are hashed at rest with plain SHA-256, not Argon2 — they are
 * six-digit, short-lived, and rate-limited by `attempt_count`, so the slow,
 * memory-hard hashing that matters for a long-lived password would only cost
 * latency here for no real benefit. A stolen hash is a 1-in-a-million guess
 * with a handful of tries before lockout regardless of how it was hashed.
 */
export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function verifyOtpCode(code: string, hash: string): boolean {
  return hashOtpCode(code) === hash;
}
