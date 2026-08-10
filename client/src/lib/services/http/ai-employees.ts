import { http } from "./client";

export type ApiAiEmployeeConfigurationVersion = {
  id: string;
  aiEmployeeId: string;
  versionNumber: number;
  status: string;
  behaviorJson: { communicationStyle: string | null };
  escalationRulesJson: { triggers: string[] };
  operatingRulesJson: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  deployedAt: string | null;
};

export type ApiAiEmployee = {
  id: string;
  workspaceId: string;
  name: string;
  roleName: string;
  status: string;
  defaultLanguage: string;
  timezone: string;
  currentConfigurationVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  configurationVersions: ApiAiEmployeeConfigurationVersion[];
};

export function listAiEmployees(workspaceId: string) {
  return http.get<ApiAiEmployee[]>(`/workspaces/${workspaceId}/ai-employees`);
}

export function getAiEmployee(workspaceId: string, employeeId: string) {
  return http.get<ApiAiEmployee>(`/workspaces/${workspaceId}/ai-employees/${employeeId}`);
}
