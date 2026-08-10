import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import { env } from "@/config/env.js";
import prismaPlugin from "@/plugins/prisma.js";
import errorHandlerPlugin from "@/plugins/error-handler.js";
import authPlugin from "@/plugins/auth.js";
import { registerAuthRoutes } from "@/modules/auth/auth.routes.js";
import { registerWorkspaceRoutes } from "@/modules/workspaces/workspace.routes.js";
import { registerOnboardingRoutes } from "@/modules/onboarding/onboarding.routes.js";
import { registerAiEmployeeRoutes } from "@/modules/ai-employees/ai-employee.routes.js";
import { registerUserRoutes } from "@/modules/users/user.routes.js";
import { registerTwilioVoiceRoutes } from "@/modules/telephony/voice.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger:
      env.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } } }
        : env.NODE_ENV === "test"
          ? false
          : true,
    trustProxy: true,
  });

  await app.register(sensible);
  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  });
  await app.register(cookie, { secret: env.COOKIE_SECRET });
  // Twilio posts webhooks as application/x-www-form-urlencoded, which Fastify
  // has no parser for out of the box.
  await app.register(formbody);
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
  });

  await app.register(errorHandlerPlugin);
  await app.register(prismaPlugin);
  await app.register(authPlugin);

  app.get("/health", () => ({ status: "ok" }));

  await app.register(
    (api) => {
      registerAuthRoutes(api);
      registerWorkspaceRoutes(api);
      registerOnboardingRoutes(api);
      registerAiEmployeeRoutes(api);
      registerUserRoutes(api);
      registerTwilioVoiceRoutes(api);
    },
    { prefix: "/api/v1" },
  );

  return app;
}
