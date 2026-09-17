import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as reviewService from "./review.service.js";
import { requireWorkspaceMember } from "@/lib/workspace-access.js";
import { ApiError } from "@/lib/errors/api-error.js";

const workspaceIdParamsSchema = z.object({ workspaceId: z.string().min(1) });
const issueParamsSchema = z.object({
  workspaceId: z.string().min(1),
  issueId: z.string().min(1),
});

const updateBodySchema = z
  .object({
    status: z.enum(["open", "in_progress", "resolved", "dismissed"]).optional(),
    assignedToUserId: z.string().min(1).nullable().optional(),
  })
  .refine((body) => body.status !== undefined || body.assignedToUserId !== undefined, {
    message: "Nothing to update.",
  });

export function registerReviewRoutes(app: FastifyInstance): void {
  // GET /workspaces/:workspaceId/review/issues — every cause, any status.
  //
  // Deliberately unfiltered: the queue's status tabs each show a count, so it
  // needs all four sets on every load. Filtering server-side would mean four
  // requests to render one screen.
  app.get(
    "/workspaces/:workspaceId/review/issues",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
      await requireWorkspaceMember(request.userId!, workspaceId);

      reply.send({ data: await reviewService.listIssues(workspaceId) });
    },
  );

  // GET /workspaces/:workspaceId/review/issues/:issueId
  app.get(
    "/workspaces/:workspaceId/review/issues/:issueId",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId, issueId } = issueParamsSchema.parse(request.params);
      await requireWorkspaceMember(request.userId!, workspaceId);

      const issue = await reviewService.getIssue(workspaceId, issueId);
      if (!issue) throw new ApiError("RESOURCE_NOT_FOUND", "Review issue not found");

      reply.send({ data: issue });
    },
  );

  // PATCH /workspaces/:workspaceId/review/issues/:issueId — triage only.
  //
  // This moves a cause through the queue; it does not fix anything. The change
  // that stops the cause recurring is made in Build, against a draft.
  app.patch(
    "/workspaces/:workspaceId/review/issues/:issueId",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId, issueId } = issueParamsSchema.parse(request.params);
      const body = updateBodySchema.parse(request.body);
      await requireWorkspaceMember(request.userId!, workspaceId);

      const issue = await reviewService.updateIssue(workspaceId, issueId, body);
      if (!issue) throw new ApiError("RESOURCE_NOT_FOUND", "Review issue not found");

      reply.send({ data: issue });
    },
  );
}
