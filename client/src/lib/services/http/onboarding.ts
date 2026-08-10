import { http } from "./client";
import type { AnswerValue, OnboardingAnswers } from "@/lib/onboarding/schema";
import type { ApiWorkspace } from "./workspaces";

export type ApiOnboardingSession = {
  id: string;
  workspaceId: string;
  status: "in_progress" | "completed";
  industryKey: string | null;
  organizationJson: Record<string, unknown>;
  completedSections: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export function getOnboarding(workspaceId: string) {
  return http.get<{ session: ApiOnboardingSession; answers: OnboardingAnswers }>(
    `/workspaces/${workspaceId}/onboarding`,
  );
}

export function setIndustry(workspaceId: string, industryKey: string) {
  return http.patch<ApiOnboardingSession>(`/workspaces/${workspaceId}/onboarding/industry`, {
    industryKey,
  });
}

export function saveAnswer(workspaceId: string, questionId: string, value: AnswerValue) {
  return http.put<void>(
    `/workspaces/${workspaceId}/onboarding/answers/${encodeURIComponent(questionId)}`,
    { value },
  );
}

export function markSectionComplete(workspaceId: string, sectionId: string) {
  return http.post<ApiOnboardingSession>(`/workspaces/${workspaceId}/onboarding/sections/complete`, {
    sectionId,
  });
}

export function completeOnboarding(workspaceId: string, aiEmployeeRoleName: string) {
  return http.post<{ workspace: ApiWorkspace; aiEmployeeId: string }>(
    `/workspaces/${workspaceId}/onboarding/complete`,
    { aiEmployeeRoleName },
  );
}
