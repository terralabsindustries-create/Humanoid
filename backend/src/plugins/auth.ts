import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken } from "@/lib/security/tokens.js";
import { ApiError } from "@/lib/errors/api-error.js";

export const ACCESS_COOKIE = "humanoid_access";
export const REFRESH_COOKIE = "humanoid_refresh";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
    userEmail?: string;
  }
  interface FastifyInstance {
    /** preHandler: 401s via ApiError if there's no valid access token. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * The access token lives in an httpOnly cookie for the web client (never
 * reachable from JS, so an XSS bug can't exfiltrate it) and is also accepted
 * as a Bearer header for programmatic/API-key-style access later, per
 * `api.md`'s "session for web, bearer for programmatic" convention.
 */
export default fp(function authPlugin(app: FastifyInstance) {
  app.decorate(
    "authenticate",
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const bearer = request.headers.authorization?.startsWith("Bearer ")
        ? request.headers.authorization.slice("Bearer ".length)
        : null;
      const token = bearer ?? request.cookies[ACCESS_COOKIE];

      if (!token) {
        throw new ApiError("AUTHENTICATION_REQUIRED", "Sign in to continue.");
      }

      const claims = await verifyAccessToken(token);
      if (!claims) {
        throw new ApiError("AUTHENTICATION_REQUIRED", "Your session has expired. Sign in again.");
      }

      request.userId = claims.sub;
      request.userEmail = claims.email;
    },
  );
});
