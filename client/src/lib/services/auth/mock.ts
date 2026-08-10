import { AuthServiceError, type AuthService, type SessionUser } from "./contract";

/**
 * Offline fallback. `httpAuthService` (`./http.ts`) is the real
 * implementation and the default export from `./index.ts` — this exists so
 * the frontend can still be exercised without the backend running (no
 * database, no server), not as the product's actual auth path.
 *
 * No real account is created and no email is ever sent. The demo OTP is
 * fixed at "123456" and shown on screen rather than pretending an email was
 * sent, for the same honesty reason `EXPOSE_OTP_IN_RESPONSE` exists on the
 * real backend.
 */

export const DEMO_OTP = "123456";

const LATENCY = { fast: 350, normal: 650 };

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let mockSession: SessionUser | null = null;

export const mockAuthService: AuthService = {
  async requestSignup({ email }) {
    await delay(LATENCY.normal);
    return { email, debugCode: DEMO_OTP };
  },

  async verifyOtp({ email, code }) {
    await delay(LATENCY.normal);
    if (code !== DEMO_OTP) {
      throw new AuthServiceError("That code isn't right. Check the digits and try again.");
    }
    const name = email.split("@")[0]?.replace(/[._-]/g, " ") ?? "there";
    mockSession = { email, name: name.replace(/\b\w/g, (c) => c.toUpperCase()) };
    return mockSession;
  },

  async resendOtp() {
    await delay(LATENCY.fast);
    return { debugCode: DEMO_OTP };
  },

  async login({ email, password }) {
    await delay(LATENCY.normal);
    if (password.length < 6) {
      throw new AuthServiceError("Incorrect email or password.");
    }
    const name = email.split("@")[0]?.replace(/[._-]/g, " ") ?? "there";
    mockSession = { email, name: name.replace(/\b\w/g, (c) => c.toUpperCase()) };
    return mockSession;
  },

  async logout() {
    await delay(LATENCY.fast);
    mockSession = null;
  },

  async getSession() {
    await delay(LATENCY.fast);
    return mockSession;
  },

  async requestPasswordReset() {
    await delay(LATENCY.normal);
    return { debugCode: DEMO_OTP };
  },

  async resetPassword({ code }) {
    await delay(LATENCY.normal);
    if (code !== DEMO_OTP) {
      throw new AuthServiceError("That code isn't right. Check the digits and try again.");
    }
  },
};
