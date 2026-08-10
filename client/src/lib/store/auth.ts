"use client";

import { create } from "zustand";

/**
 * Local auth cache — not the security boundary. The real session lives in
 * httpOnly cookies the backend sets (`backend/src/lib/security/session-
 * cookies.ts`); this store only mirrors enough of it (`status`, `email`,
 * `name`) to paint the right UI instantly on load, before/without a network
 * round trip. Anywhere a decision actually matters (route guards on entry,
 * post-auth redirects), `lib/onboarding/bootstrap.ts` confirms against the
 * real backend session rather than trusting this cache alone.
 *
 * Same hydrate-after-mount, localStorage-backed pattern as
 * `store/preferences.ts` and `store/scope.ts`.
 */

export type AuthStatus = "anonymous" | "pending_verification" | "authenticated";

type Session = {
  status: AuthStatus;
  email: string | null;
  name: string | null;
};

const STORAGE_KEY = "humanoid.auth";

type AuthStore = Session & {
  hydrated: boolean;
  /** The dev-only OTP hint, when the backend exposed one (see
   *  `EXPOSE_OTP_IN_RESPONSE`). Null once a real email provider is wired up. */
  pendingDebugCode: string | null;
  /** Signup succeeded; an OTP is "sent" and the session is not live yet. */
  beginVerification(email: string, name: string, debugCode?: string): void;
  setPendingDebugCode(code: string | null): void;
  /** `remember: false` (unchecked "Remember me") keeps the session in memory
   *  only — it does not survive a refresh, same as any tab-only session. */
  signIn(email: string, name?: string, remember?: boolean): void;
  /** Clears the local cache only. Call `authService.logout()` first to
   *  revoke the real server-side session — see `components/auth/sign-out`. */
  signOut(): void;
  hydrate(): void;
};

function persist(session: Session) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Session degrades to tab-only if storage is unavailable.
  }
}

export const useAuth = create<AuthStore>((set) => ({
  status: "anonymous",
  email: null,
  name: null,
  hydrated: false,
  pendingDebugCode: null,

  beginVerification(email, name, debugCode) {
    const session: Session = { status: "pending_verification", email, name };
    set({ ...session, hydrated: true, pendingDebugCode: debugCode ?? null });
    persist(session);
  },

  setPendingDebugCode(code) {
    set({ pendingDebugCode: code });
  },

  signIn(email, name, remember = true) {
    const session: Session = { status: "authenticated", email, name: name ?? null };
    set({ ...session, hydrated: true, pendingDebugCode: null });
    if (remember) persist(session);
  },

  signOut() {
    const session: Session = { status: "anonymous", email: null, name: null };
    set({ ...session, hydrated: true, pendingDebugCode: null });
    persist(session);
    try {
      window.localStorage.removeItem("humanoid.onboarding");
    } catch {
      // Best effort — a stale onboarding session is harmless, just untidy.
    }
  },

  hydrate() {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const stored = raw ? (JSON.parse(raw) as Partial<Session>) : null;
      const validStatus =
        stored?.status === "authenticated" || stored?.status === "pending_verification";
      set({
        status: validStatus ? stored.status! : "anonymous",
        email: stored?.email ?? null,
        name: stored?.name ?? null,
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },
}));
