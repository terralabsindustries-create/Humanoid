import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as aiEmployeeService from "./ai-employee.service.js";
import { requireWorkspaceMember } from "@/lib/workspace-access.js";

const workspaceIdParamsSchema = z.object({ workspaceId: z.string().min(1) });
const employeeParamsSchema = z.object({
  workspaceId: z.string().min(1),
  employeeId: z.string().min(1),
});

export function registerAiEmployeeRoutes(app: FastifyInstance): void {
  app.get(
    "/workspaces/:workspaceId/ai-employees",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
      await requireWorkspaceMember(request.userId!, workspaceId);
      const employees = await aiEmployeeService.listAiEmployees(workspaceId);
      reply.send({ data: employees });
    },
  );

  app.get(
    "/workspaces/:workspaceId/ai-employees/:employeeId",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId, employeeId } = employeeParamsSchema.parse(request.params);
      await requireWorkspaceMember(request.userId!, workspaceId);
      const employee = await aiEmployeeService.getAiEmployee(workspaceId, employeeId);
      reply.send({ data: employee });
    },
  );
}
