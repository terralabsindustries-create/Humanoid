/**
 * The auth service contract.
 *
 * Mirrors the pattern in `lib/services/contract.ts`: an interface a mock
 * satisfies today and an HTTP/OTP-provider implementation satisfies later,
 * with no screen change required when that swap happens. Kept as its own
 * contract rather than folded into `HumanoidService` — that interface is for
 * the authenticated workspace; this one exists before a session does.
 *
 * `debugCode` fields are populated only when the backend has no real email
 * provider wired up (`EXPOSE_OTP_IN_RESPONSE=true`, dev-only) — see
 * `backend/src/lib/notifications/sender.ts`. Never present in production.
 */

export type SignupInput = {
  name: string;
  email: string;
  password: string;
};

export type SessionUser = {
  name: string;
  email: string;
};

export class AuthServiceError extends Error {}

export interface AuthService {
  // POST /v1/auth/signup — creates a pending account and sends a verification code
  requestSignup(input: SignupInput): Promise<{ email: string; debugCode?: string }>;
  // POST /v1/auth/otp/verify — also establishes the session
  verifyOtp(input: { email: string; code: string }): Promise<SessionUser>;
  // POST /v1/auth/otp/resend
  resendOtp(email: string): Promise<{ debugCode?: string }>;
  // POST /v1/auth/login
  login(input: { email: string; password: string }): Promise<SessionUser>;
  // POST /v1/auth/logout
  logout(): Promise<void>;
  // GET /v1/auth/session — the source of truth for "am I signed in", not localStorage
  getSession(): Promise<SessionUser | null>;
  // POST /v1/auth/password/forgot
  requestPasswordReset(email: string): Promise<{ debugCode?: string }>;
  // POST /v1/auth/password/reset
  resetPassword(input: { email: string; code: string; newPassword: string }): Promise<void>;
}
