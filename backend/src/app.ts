import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import websocket from "@fastify/websocket";
import { env } from "@/config/env.js";
import prismaPlugin from "@/plugins/prisma.js";
import errorHandlerPlugin from "@/plugins/error-handler.js";
import authPlugin from "@/plugins/auth.js";
import { registerAuthRoutes } from "@/modules/auth/auth.routes.js";
import { registerWorkspaceRoutes } from "@/modules/workspaces/workspace.routes.js";
import { registerOnboardingRoutes } from "@/modules/onboarding/onboarding.routes.js";
import { registerAiEmployeeRoutes } from "@/modules/ai-employees/ai-employee.routes.js";
import { registerConversationRoutes } from "@/modules/conversations/conversation.routes.js";
import { registerRecordRoutes } from "@/modules/records/record.routes.js";
import { registerReviewRoutes } from "@/modules/review/review.routes.js";
import { registerPartyRoutes } from "@/modules/parties/party.routes.js";
import { registerUsageRoutes } from "@/modules/usage/usage.routes.js";
import { registerScheduleRoutes } from "@/modules/schedule/schedule.routes.js";
import { registerUserRoutes } from "@/modules/users/user.routes.js";
import { registerTwilioVoiceRoutes } from "@/modules/telephony/voice.routes.js";
import { registerConversationRelay } from "@/modules/telephony/conversation-relay.js";

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
    // In development the client's port drifts — anything already holding 3000
    // pushes Next to 3001, then 3002 — and a fixed origin list turns each bump
    // into a CORS rejection the browser reports as a generic network error,
    // which is indistinguishable from being offline. Match any loopback port
    // instead. Production still uses the explicit CORS_ORIGIN list.
    origin:
      env.NODE_ENV === "development"
        ? [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/]
        : env.CORS_ORIGIN,
    credentials: true,
  });
  await app.register(cookie, { secret: env.COOKIE_SECRET });
  // Twilio posts webhooks as application/x-www-form-urlencoded, which Fastify
  // has no parser for out of the box.
  await app.register(formbody);
  // Twilio ConversationRelay holds one WebSocket open per phone call.
  await app.register(websocket);
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
      registerConversationRoutes(api);
      registerRecordRoutes(api);
      registerReviewRoutes(api);
      registerPartyRoutes(api);
      registerUsageRoutes(api);
      registerScheduleRoutes(api);
      registerUserRoutes(api);
      registerTwilioVoiceRoutes(api);
      registerConversationRelay(api);
    },
    { prefix: "/api/v1" },
  );

  return app;
}
