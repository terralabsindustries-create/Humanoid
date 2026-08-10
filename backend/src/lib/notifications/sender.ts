import type { FastifyBaseLogger } from "fastify";

/**
 * No email provider is wired up yet — see `CLAUDE.md` for the same rule
 * applied on the frontend side. This interface is the seam: swapping the
 * console adapter for a real provider (Postmark, Resend, SES) later is a
 * one-file change, and nothing that calls `send()` needs to know which one
 * is behind it.
 */
export interface NotificationSender {
  send(input: { to: string; subject: string; body: string }): Promise<void>;
}

/**
 * Logs to the server console instead of delivering anything. This is the
 * *only* place in the backend allowed to know an OTP code in plaintext
 * outside the request that generated it — everywhere else only ever sees
 * the hash.
 */
export class ConsoleNotificationSender implements NotificationSender {
  constructor(private readonly logger: FastifyBaseLogger) {}

  // Not `async` — nothing here awaits anything, but the interface still
  // returns a Promise so a real (genuinely async) provider is a drop-in swap.
  send(input: { to: string; subject: string; body: string }): Promise<void> {
    this.logger.info(
      { to: input.to, subject: input.subject },
      `[dev notification] ${input.subject} -> ${input.to}: ${input.body}`,
    );
    return Promise.resolve();
  }
}
