import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as recordService from "./record.service.js";
import { requireWorkspaceMember } from "@/lib/workspace-access.js";

const workspaceIdParamsSchema = z.object({ workspaceId: z.string().min(1) });
const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
  /** Everything raised for one person, for their directory record's history. */
  partyId: z.string().min(1).optional(),
});

export function registerRecordRoutes(app: FastifyInstance): void {
  // GET /workspaces/:workspaceId/records — everything the AI created here
  app.get(
    "/workspaces/:workspaceId/records",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
      const { limit, partyId } = listQuerySchema.parse(request.query);
      await requireWorkspaceMember(request.userId!, workspaceId);

      const records = await recordService.listRecords(workspaceId, { limit, partyId });

      reply.send({
        data: records.map((r) => ({
          id: r.id,
          partyId: r.partyId,
          archetype: r.archetype,
          typeId: r.typeId,
          status: r.status,
          partyName: r.partyName,
          partyPhone: r.partyPhone,
          scheduledAt: r.scheduledAt?.toISOString() ?? null,
          fields: r.fieldsJson,
          createdByConversationId: r.conversationId,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    },
  );
}
