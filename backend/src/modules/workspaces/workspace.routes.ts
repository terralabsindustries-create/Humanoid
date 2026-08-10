import type { FastifyInstance } from "fastify";
import {
  createWorkspaceBodySchema,
  updateWorkspaceBodySchema,
  workspaceIdParamsSchema,
} from "./workspace.schemas.js";
import * as workspaceService from "./workspace.service.js";
import { requireWorkspaceMember } from "@/lib/workspace-access.js";

export function registerWorkspaceRoutes(app: FastifyInstance): void {
  app.post("/workspaces", { preHandler: app.authenticate }, async (request, reply) => {
    const body = createWorkspaceBodySchema.parse(request.body);
    const result = await workspaceService.createWorkspaceWithOnboarding(request.userId!, body);
    reply.status(201).send({
      data: {
        workspace: result.workspace,
        onboardingSessionId: result.onboardingSessionId,
      },
    });
  });

  app.get("/workspaces/:workspaceId", { preHandler: app.authenticate }, async (request, reply) => {
    const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
    await requireWorkspaceMember(request.userId!, workspaceId);
    const workspace = await workspaceService.getWorkspace(workspaceId);
    reply.send({ data: workspace });
  });

  app.patch("/workspaces/:workspaceId", { preHandler: app.authenticate }, async (request, reply) => {
    const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
    await requireWorkspaceMember(request.userId!, workspaceId);
    const body = updateWorkspaceBodySchema.parse(request.body);
    const workspace = await workspaceService.updateOrganizationInfo(workspaceId, body);
    reply.send({ data: workspace });
  });
}
