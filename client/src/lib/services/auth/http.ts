import { http, HttpError } from "@/lib/services/http/client";
import { AuthServiceError, type AuthService, type SessionUser, type SignupInput } from "./contract";

/**
 * The real implementation. Sessions live in httpOnly cookies set by the
 * backend (`Set-Cookie` on verify/login/refresh) — this module never reads,
 * writes, or stores a token itself. `credentials: "include"` on every
 * request (see `lib/services/http/client.ts`) is what makes that cookie
 * round-trip at all.
 */
async function unwrap<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof HttpError) throw new AuthServiceError(error.message);
    throw error;
  }
}

export const httpAuthService: AuthService = {
  requestSignup(input: SignupInput) {
    return unwrap(http.post<{ email: string; debugCode?: string }>("/auth/signup", input));
  },

  verifyOtp(input) {
    return unwrap(http.post<SessionUser>("/auth/otp/verify", input));
  },

  resendOtp(email) {
    return unwrap(http.post<{ debugCode?: string }>("/auth/otp/resend", { email }));
  },

  login(input) {
    return unwrap(http.post<SessionUser>("/auth/login", input));
  },

  logout() {
    return unwrap(http.post<void>("/auth/logout"));
  },

  async getSession() {
    try {
      return await http.get<SessionUser>("/auth/session");
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) return null;
      throw error;
    }
  },

  requestPasswordReset(email) {
    return unwrap(http.post<{ debugCode?: string }>("/auth/password/forgot", { email }));
  },

  resetPassword(input) {
    return unwrap(http.post<void>("/auth/password/reset", input));
  },
};
