import argon2 from "argon2";

/**
 * Argon2id — the current OWASP-recommended default, and memory-hard against
 * GPU cracking in a way bcrypt no longer comfortably is.
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // A malformed hash should fail closed, not throw past the caller.
    return false;
  }
}
