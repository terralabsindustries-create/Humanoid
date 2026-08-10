import type { FastifyInstance } from "fastify";
import { prisma } from "@/db/client.js";
import { ApiError } from "@/lib/errors/api-error.js";
import { listMyWorkspaces } from "@/modules/workspaces/workspace.service.js";

/**
 * The one call the frontend makes on load to answer "who is signed in, and
 * where do they belong" — session restoration and onboarding resume both
 * key off this instead of trusting whatever was last written to
 * localStorage.
 */
export function registerUserRoutes(app: FastifyInstance): void {
  app.get("/me", { preHandler: app.authenticate }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.userId! } });
    if (!user) throw new ApiError("AUTHENTICATION_REQUIRED", "Sign in to continue.");

    const workspaces = await listMyWorkspaces(user.id);

    reply.send({
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          status: user.status,
        },
        workspaces,
      },
    });
  });
}
