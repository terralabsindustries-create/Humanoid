import type { FastifyInstance } from "fastify";
import {
  workspaceIdParamsSchema,
  questionParamsSchema,
  setIndustryBodySchema,
  saveAnswerBodySchema,
  markSectionCompleteBodySchema,
  completeOnboardingBodySchema,
} from "./onboarding.schemas.js";
import * as onboardingService from "./onboarding.service.js";
import { requireWorkspaceMember } from "@/lib/workspace-access.js";

export function registerOnboardingRoutes(app: FastifyInstance): void {
  app.get(
    "/workspaces/:workspaceId/onboarding",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
      await requireWorkspaceMember(request.userId!, workspaceId);
      const { session, answers } = await onboardingService.getSessionWithAnswers(workspaceId);
      reply.send({ data: { session, answers } });
    },
  );

  app.patch(
    "/workspaces/:workspaceId/onboarding/industry",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
      await requireWorkspaceMember(request.userId!, workspaceId);
      const body = setIndustryBodySchema.parse(request.body);
      const session = await onboardingService.setIndustry(workspaceId, body.industryKey);
      reply.send({ data: session });
    },
  );

  app.put(
    "/workspaces/:workspaceId/onboarding/answers/:questionId",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId, questionId } = questionParamsSchema.parse(request.params);
      await requireWorkspaceMember(request.userId!, workspaceId);
      const body = saveAnswerBodySchema.parse(request.body);
      await onboardingService.saveAnswer(workspaceId, questionId, body.value);
      reply.status(204).send();
    },
  );

  app.post(
    "/workspaces/:workspaceId/onboarding/sections/complete",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
      await requireWorkspaceMember(request.userId!, workspaceId);
      const body = markSectionCompleteBodySchema.parse(request.body);
      const session = await onboardingService.markSectionComplete(workspaceId, body.sectionId);
      reply.send({ data: session });
    },
  );

  app.post(
    "/workspaces/:workspaceId/onboarding/complete",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
      await requireWorkspaceMember(request.userId!, workspaceId);
      const body = completeOnboardingBodySchema.parse(request.body);
      const result = await onboardingService.completeOnboarding(
        workspaceId,
        request.userId!,
        body.aiEmployeeRoleName,
      );
      reply.send({ data: result });
    },
  );
}
