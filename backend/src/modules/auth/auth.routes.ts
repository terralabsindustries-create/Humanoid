import type { FastifyInstance } from "fastify";
import {
  signupBodySchema,
  verifyOtpBodySchema,
  resendOtpBodySchema,
  loginBodySchema,
  requestPasswordResetBodySchema,
  resetPasswordBodySchema,
} from "./auth.schemas.js";
import * as authService from "./auth.service.js";
import { ConsoleNotificationSender } from "@/lib/notifications/sender.js";
import { setSessionCookies, clearSessionCookies } from "@/lib/security/session-cookies.js";
import { REFRESH_COOKIE } from "@/plugins/auth.js";
import { ApiError } from "@/lib/errors/api-error.js";

function toUserResponse(user: { name: string; email: string }) {
  return { name: user.name, email: user.email };
}

/** A handful of brute-forceable auth endpoints get a tighter limit than the
 *  global default — password guessing and OTP guessing are exactly the
 *  attack this is for. */
const STRICT_RATE_LIMIT = { max: 10, timeWindow: "15 minutes" };

export function registerAuthRoutes(app: FastifyInstance): void {
  const sender = new ConsoleNotificationSender(app.log);

  app.post(
    "/auth/signup",
    { config: { rateLimit: STRICT_RATE_LIMIT } },
    async (request, reply) => {
      const body = signupBodySchema.parse(request.body);
      const result = await authService.signup(body, sender);
      reply.status(201).send({ data: result });
    },
  );

  app.post(
    "/auth/otp/verify",
    { config: { rateLimit: STRICT_RATE_LIMIT } },
    async (request, reply) => {
      const body = verifyOtpBodySchema.parse(request.body);
      const { user, tokens } = await authService.verifySignupOtp(body, {
        userAgent: request.headers["user-agent"],
        ip: request.ip,
      });
      setSessionCookies(reply, tokens);
      reply.send({ data: toUserResponse(user) });
    },
  );

  app.post(
    "/auth/otp/resend",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const body = resendOtpBodySchema.parse(request.body);
      const result = await authService.resendSignupOtp(body.email, sender);
      reply.status(202).send({ data: result });
    },
  );

  app.post(
    "/auth/login",
    { config: { rateLimit: STRICT_RATE_LIMIT } },
    async (request, reply) => {
      const body = loginBodySchema.parse(request.body);
      const { user, tokens } = await authService.login(body, {
        userAgent: request.headers["user-agent"],
        ip: request.ip,
      });
      setSessionCookies(reply, tokens);
      reply.send({ data: toUserResponse(user) });
    },
  );

  app.post("/auth/refresh", async (request, reply) => {
    const { user, tokens } = await authService.refreshSession(request.cookies[REFRESH_COOKIE], {
      userAgent: request.headers["user-agent"],
      ip: request.ip,
    });
    setSessionCookies(reply, tokens);
    reply.send({ data: toUserResponse(user) });
  });

  app.post("/auth/logout", async (request, reply) => {
    await authService.logout(request.cookies[REFRESH_COOKIE]);
    clearSessionCookies(reply);
    reply.status(204).send();
  });

  app.get("/auth/session", { preHandler: app.authenticate }, async (request, reply) => {
    const user = await authService.getUserById(request.userId!);
    if (!user) throw new ApiError("AUTHENTICATION_REQUIRED", "Sign in to continue.");
    reply.send({ data: toUserResponse(user) });
  });

  app.post(
    "/auth/password/forgot",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const body = requestPasswordResetBodySchema.parse(request.body);
      const result = await authService.requestPasswordReset(body.email, sender);
      reply.status(202).send({ data: result });
    },
  );

  app.post(
    "/auth/password/reset",
    { config: { rateLimit: STRICT_RATE_LIMIT } },
    async (request, reply) => {
      const body = resetPasswordBodySchema.parse(request.body);
      await authService.resetPassword(body);
      reply.status(204).send();
    },
  );
}
