import { Prisma } from "@prisma/client";
import { prisma } from "@/db/client.js";
import { ApiError } from "@/lib/errors/api-error.js";
import { recordAudit } from "@/lib/audit.js";
import type { OnboardingSession } from "@prisma/client";

/** Prisma's Json columns need the `Prisma.JsonNull` sentinel for an explicit
 *  JSON null — a bare JS `null` there means something different to Prisma. */
function toJsonInput(value: AnswerValue): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : value;
}

/**
 * Same three ids as the frontend's `STANDARD_AI_QUESTION_IDS`
 * (`client/src/lib/domains/shared.ts`). Every domain pack's final onboarding
 * section ends with questions under these ids regardless of industry, which
 * is what lets `completeOnboarding` below read them without knowing anything
 * about which pack produced them.
 */
const AI_QUESTION_IDS = {
  name: "ai_name",
  style: "communication_style",
  escalation: "escalation_triggers",
} as const;

export type AnswerValue = string | string[] | number | boolean | null;

async function getSessionOrThrow(workspaceId: string): Promise<OnboardingSession> {
  const session = await prisma.onboardingSession.findUnique({ where: { workspaceId } });
  if (!session) {
    throw new ApiError("RESOURCE_NOT_FOUND", "No onboarding session exists for this workspace.");
  }
  return session;
}

export async function getSessionWithAnswers(workspaceId: string) {
  const session = await getSessionOrThrow(workspaceId);
  const answerRows = await prisma.onboardingAnswer.findMany({ where: { onboardingSessionId: session.id } });

  const answers: Record<string, AnswerValue> = {};
  for (const row of answerRows) {
    answers[row.questionId] = row.valueJson as AnswerValue;
  }

  return { session, answers };
}

export async function setIndustry(workspaceId: string, industryKey: string): Promise<OnboardingSession> {
  const session = await getSessionOrThrow(workspaceId);

  if (session.status === "completed") {
    throw new ApiError("RESOURCE_CONFLICT", "Onboarding is already complete for this workspace.");
  }

  // Changing industry invalidates every answer from the previous pack — an
  // answer to hospitality's "room_count" has no home in a legal pack's
  // schema. Same rule as the frontend's `useOnboarding.setIndustry`.
  return prisma.$transaction(async (tx) => {
    await tx.onboardingAnswer.deleteMany({ where: { onboardingSessionId: session.id } });
    return tx.onboardingSession.update({
      where: { id: session.id },
      data: { industryKey, completedSections: [] },
    });
  });
}

export async function saveAnswer(
  workspaceId: string,
  questionId: string,
  value: AnswerValue,
): Promise<void> {
  const session = await getSessionOrThrow(workspaceId);
  if (session.status === "completed") {
    throw new ApiError("RESOURCE_CONFLICT", "Onboarding is already complete for this workspace.");
  }

  const valueJson = toJsonInput(value);
  await prisma.onboardingAnswer.upsert({
    where: { onboardingSessionId_questionId: { onboardingSessionId: session.id, questionId } },
    update: { valueJson },
    create: { onboardingSessionId: session.id, questionId, valueJson },
  });
}

export async function markSectionComplete(
  workspaceId: string,
  sectionId: string,
): Promise<OnboardingSession> {
  const session = await getSessionOrThrow(workspaceId);
  if (session.completedSections.includes(sectionId)) return session;

  return prisma.onboardingSession.update({
    where: { id: session.id },
    data: { completedSections: [...session.completedSections, sectionId] },
  });
}

export async function completeOnboarding(
  workspaceId: string,
  userId: string,
  aiEmployeeRoleName: string,
): Promise<{ workspace: Awaited<ReturnType<typeof prisma.workspace.update>>; aiEmployeeId: string }> {
  const { session, answers } = await getSessionWithAnswers(workspaceId);

  if (session.status === "completed") {
    throw new ApiError("RESOURCE_CONFLICT", "Onboarding is already complete for this workspace.");
  }
  if (!session.industryKey) {
    throw new ApiError("VALIDATION_ERROR", "Choose an industry before finishing onboarding.");
  }

  const aiName = (answers[AI_QUESTION_IDS.name] as string) || "AI Assistant";
  const communicationStyle = answers[AI_QUESTION_IDS.style] ?? null;
  const escalationTriggers = Array.isArray(answers[AI_QUESTION_IDS.escalation])
    ? (answers[AI_QUESTION_IDS.escalation] as string[])
    : [];

  const result = await prisma.$transaction(async (tx) => {
    const employee = await tx.aiEmployee.create({
      data: {
        workspaceId,
        name: aiName,
        roleName: aiEmployeeRoleName,
        status: "live",
      },
    });

    const version = await tx.aiEmployeeConfigurationVersion.create({
      data: {
        aiEmployeeId: employee.id,
        versionNumber: 1,
        status: "live",
        behaviorJson: { communicationStyle },
        escalationRulesJson: { triggers: escalationTriggers },
        createdBy: userId,
        deployedAt: new Date(),
      },
    });

    await tx.aiEmployee.update({
      where: { id: employee.id },
      data: { currentConfigurationVersionId: version.id },
    });

    await tx.onboardingSession.update({
      where: { id: session.id },
      data: { status: "completed", completedAt: new Date() },
    });

    const workspace = await tx.workspace.update({
      where: { id: workspaceId },
      data: { industryKey: session.industryKey },
    });

    return { workspace, aiEmployeeId: employee.id };
  });

  await recordAudit({
    workspaceId,
    actorType: "user",
    actorId: userId,
    action: "onboarding.completed",
    resourceType: "ai_employee",
    resourceId: result.aiEmployeeId,
    metadata: { industryKey: session.industryKey },
  });

  return result;
}
