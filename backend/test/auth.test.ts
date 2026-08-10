import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, extractCookies, signUpAndVerify } from "./helpers.js";

describe("auth", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it("signs up, verifies with the real code, and establishes a session", async () => {
    const signupRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { name: "Jordan Ellis", email: "jordan@example.com", password: "password123" },
    });
    expect(signupRes.statusCode).toBe(201);
    const { debugCode } = signupRes.json().data;
    expect(debugCode).toMatch(/^\d{6}$/);

    const verifyRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/verify",
      payload: { email: "jordan@example.com", code: debugCode },
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().data).toEqual({ name: "Jordan Ellis", email: "jordan@example.com" });

    const cookie = extractCookies(verifyRes);
    const sessionRes = await app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { cookie },
    });
    expect(sessionRes.statusCode).toBe(200);
    expect(sessionRes.json().data.email).toBe("jordan@example.com");
  });

  it("rejects an incorrect OTP and does not consume the real one", async () => {
    const signupRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { name: "Jordan Ellis", email: "jordan@example.com", password: "password123" },
    });
    const { debugCode } = signupRes.json().data;

    const wrongRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/verify",
      payload: { email: "jordan@example.com", code: "000000" },
    });
    expect(wrongRes.statusCode).toBe(400);
    expect(wrongRes.json().error.code).toBe("VALIDATION_ERROR");

    const rightRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/verify",
      payload: { email: "jordan@example.com", code: debugCode },
    });
    expect(rightRes.statusCode).toBe(200);
  });

  it("locks out after too many incorrect OTP attempts", async () => {
    const signupRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { name: "Jordan Ellis", email: "jordan@example.com", password: "password123" },
    });
    const { debugCode } = signupRes.json().data;

    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/otp/verify",
        payload: { email: "jordan@example.com", code: "111111" },
      });
    }

    // Even the correct code is now rejected — the code is spent, not the guesser.
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/verify",
      payload: { email: "jordan@example.com", code: debugCode },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("RATE_LIMITED");
  });

  it("rejects login with the wrong password", async () => {
    await signUpAndVerify(app, { name: "Jordan Ellis", email: "jordan@example.com", password: "password123" });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "jordan@example.com", password: "wrongpassword" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("logs in with the right password after verification", async () => {
    await signUpAndVerify(app, { name: "Jordan Ellis", email: "jordan@example.com", password: "password123" });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "jordan@example.com", password: "password123" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.email).toBe("jordan@example.com");
  });

  it("rejects a second signup on an already-verified email", async () => {
    await signUpAndVerify(app, { name: "Jordan Ellis", email: "jordan@example.com", password: "password123" });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { name: "Someone Else", email: "jordan@example.com", password: "password456" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("RESOURCE_CONFLICT");
  });

  it("rejects unauthenticated access to /me", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("logout revokes the session", async () => {
    const { cookie } = await signUpAndVerify(app, {
      name: "Jordan Ellis",
      email: "jordan@example.com",
      password: "password123",
    });

    const logoutRes = await app.inject({ method: "POST", url: "/api/v1/auth/logout", headers: { cookie } });
    expect(logoutRes.statusCode).toBe(204);

    // The access token itself is still technically live (short TTL, stateless
    // JWT) — logout's real guarantee is that the *refresh* token no longer
    // works, so the session cannot be renewed once the access token expires.
    const refreshCookie = cookie
      .split("; ")
      .find((c) => c.startsWith("humanoid_refresh"));
    const refreshRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: { cookie: refreshCookie ?? "" },
    });
    expect(refreshRes.statusCode).toBe(401);
  });

  it("resets a password with the real code, and invalidates old sessions", async () => {
    const { cookie: oldCookie } = await signUpAndVerify(app, {
      name: "Jordan Ellis",
      email: "jordan@example.com",
      password: "password123",
    });

    const forgotRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password/forgot",
      payload: { email: "jordan@example.com" },
    });
    const { debugCode } = forgotRes.json().data;

    const wrongReset = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password/reset",
      payload: { email: "jordan@example.com", code: "000000", newPassword: "newpassword123" },
    });
    expect(wrongReset.statusCode).toBe(400);

    const resetRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password/reset",
      payload: { email: "jordan@example.com", code: debugCode, newPassword: "newpassword123" },
    });
    expect(resetRes.statusCode).toBe(204);

    // Old password no longer works.
    const oldLoginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "jordan@example.com", password: "password123" },
    });
    expect(oldLoginRes.statusCode).toBe(400);

    // New password does.
    const newLoginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "jordan@example.com", password: "newpassword123" },
    });
    expect(newLoginRes.statusCode).toBe(200);

    // The refresh token issued before the reset is dead.
    const oldRefreshCookie = oldCookie.split("; ").find((c) => c.startsWith("humanoid_refresh"));
    const refreshRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: { cookie: oldRefreshCookie ?? "" },
    });
    expect(refreshRes.statusCode).toBe(401);
  });

  it("does not reveal whether an email is registered on resend or forgot-password", async () => {
    const resendRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/resend",
      payload: { email: "nobody@example.com" },
    });
    expect(resendRes.statusCode).toBe(202);
    expect(resendRes.json().data.debugCode).toBeUndefined();

    const forgotRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password/forgot",
      payload: { email: "nobody@example.com" },
    });
    expect(forgotRes.statusCode).toBe(202);
    expect(forgotRes.json().data.debugCode).toBeUndefined();
  });
});
