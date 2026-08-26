import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as usageService from "./usage.service.js";
import { requireWorkspaceCapability } from "@/lib/workspace-access.js";
import { ApiError } from "@/lib/errors/api-error.js";

const workspaceIdParamsSchema = z.object({ workspaceId: z.string().min(1) });

const budgetBodySchema = z.object({
  /**
   * Minor units. Null is "no budget", which is a different answer from 0 —
   * a cap of nothing would trip on the first call of the month, so the two
   * must never be conflated on the way in either.
   */
  budgetMonth: z.number().int().min(0).nullable(),
  atCap: z.enum(["notify", "voicemail", "stop"]),
});

export function registerUsageRoutes(app: FastifyInstance): void {
  // GET /workspaces/:workspaceId/usage
  //
  // Gated on `billing.read`, not merely on membership. The frontend hides this
  // surface from an Operator, and a check that lived only there would make
  // spend visible to anyone who typed the URL.
  app.get(
    "/workspaces/:workspaceId/usage",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
      await requireWorkspaceCapability(request.userId!, workspaceId, "billing.read");

      const snapshot = await usageService.getSnapshot(workspaceId);
      if (!snapshot) throw new ApiError("RESOURCE_NOT_FOUND", "Workspace not found.");

      reply.send({ data: snapshot });
    },
  );

  // PUT /workspaces/:workspaceId/usage/budget
  //
  // Takes effect immediately — there is no draft to publish, which the screen
  // states before anyone presses save. The audit row is written with the
  // change, in one transaction.
  app.put(
    "/workspaces/:workspaceId/usage/budget",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
      const body = budgetBodySchema.parse(request.body);
      await requireWorkspaceCapability(request.userId!, workspaceId, "billing.read");

      // Refused rather than stored: a cap behaviour nothing can carry out is
      // a setting that lies about what will happen. The snapshot ships the
      // same block list so the editor can say why before anyone tries.
      if (!usageService.isCapBehaviourAvailable(body.atCap)) {
        throw new ApiError(
          "POLICY_BLOCKED",
          usageService.CAP_BEHAVIOUR_BLOCKS[body.atCap] ??
            "That behaviour at the cap is not available.",
        );
      }

      const snapshot = await usageService.setBudget(workspaceId, {
        budgetMonth: body.budgetMonth,
        atCap: body.atCap,
        actorUserId: request.userId!,
      });
      if (!snapshot) throw new ApiError("RESOURCE_NOT_FOUND", "Workspace not found.");

      reply.send({ data: snapshot });
    },
  );
}
