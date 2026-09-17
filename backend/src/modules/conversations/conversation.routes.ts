import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as conversationService from "./conversation.service.js";
import { prisma } from "@/db/client.js";
import { requireWorkspaceMember } from "@/lib/workspace-access.js";
import { ApiError } from "@/lib/errors/api-error.js";

const workspaceIdParamsSchema = z.object({ workspaceId: z.string().min(1) });
const conversationParamsSchema = z.object({
  workspaceId: z.string().min(1),
  conversationId: z.string().min(1),
});
const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
  /** Every call with one person, for their directory record's history. */
  partyId: z.string().min(1).optional(),
});

export function registerConversationRoutes(app: FastifyInstance): void {
  // GET /workspaces/:workspaceId/conversations
  app.get(
    "/workspaces/:workspaceId/conversations",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
      const { limit, partyId } = listQuerySchema.parse(request.query);
      await requireWorkspaceMember(request.userId!, workspaceId);
      const conversations = await conversationService.listConversations(workspaceId, { limit, partyId });
      reply.send({ data: conversations });
    },
  );

  // GET /workspaces/:workspaceId/conversations/:conversationId — includes the transcript
  app.get(
    "/workspaces/:workspaceId/conversations/:conversationId",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId, conversationId } = conversationParamsSchema.parse(request.params);
      await requireWorkspaceMember(request.userId!, workspaceId);
      const conversation = await conversationService.getConversation(workspaceId, conversationId);
      if (!conversation) throw new ApiError("RESOURCE_NOT_FOUND", "Conversation not found");
      reply.send({ data: conversation });
    },
  );

  // GET /workspaces/:workspaceId/conversations/stats — the dashboard's numbers
  app.get(
    "/workspaces/:workspaceId/conversations-stats",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
      await requireWorkspaceMember(request.userId!, workspaceId);

      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { timezone: true },
      });
      if (!workspace) throw new ApiError("RESOURCE_NOT_FOUND", "Workspace not found");

      const stats = await conversationService.getStats(workspaceId, workspace.timezone);
      reply.send({ data: stats });
    },
  );
}
