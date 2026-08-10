import type { FastifyReply } from "fastify";
import { env } from "@/config/env.js";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/plugins/auth.js";

const isProd = env.NODE_ENV === "production";

/** Sets both session cookies after signup verification, login, or refresh. */
export function setSessionCookies(
  reply: FastifyReply,
  tokens: { accessToken: string; refreshToken: string },
): void {
  // Not cookie-signed: the access token is itself a signed JWT and the
  // refresh token is validated by hash lookup, so both are already
  // tamper-evident — wrapping them in a signed cookie would be redundant and
  // would require unsigning before every read.
  reply.setCookie(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: env.ACCESS_TOKEN_TTL_MINUTES * 60,
  });

  // Scoped to the auth routes only — the one place it's ever needed — so it
  // isn't attached to every other API request this session makes.
  reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookies(reply: FastifyReply): void {
  reply.clearCookie(ACCESS_COOKIE, { path: "/" });
  reply.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
}
