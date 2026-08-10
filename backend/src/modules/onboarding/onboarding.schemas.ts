import { z } from "zod";

export const workspaceIdParamsSchema = z.object({
  workspaceId: z.string().min(1),
});

export const questionParamsSchema = z.object({
  workspaceId: z.string().min(1),
  questionId: z.string().min(1),
});

export const setIndustryBodySchema = z.object({
  industryKey: z.string().min(1).max(50),
});

/** Mirrors the frontend's `AnswerValue` union in `lib/onboarding/schema.ts`. */
export const answerValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const saveAnswerBodySchema = z.object({
  value: answerValueSchema,
});

export const markSectionCompleteBodySchema = z.object({
  sectionId: z.string().min(1).max(100),
});

export const completeOnboardingBodySchema = z.object({
  aiEmployeeRoleName: z.string().min(1).max(100),
});
