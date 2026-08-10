import { http } from "./client";

export type ApiWorkspace = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  industryKey: string | null;
  timezone: string;
  locale: string;
  status: string;
  settingsJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationInfo = {
  businessName: string;
  website: string;
  country: string;
  companySize: string;
};

/** The "organization setup" onboarding step — creates the organization,
 *  workspace, owner membership and onboarding session together. */
export function createWorkspace(input: OrganizationInfo) {
  return http.post<{ workspace: ApiWorkspace; onboardingSessionId: string }>("/workspaces", input);
}

export function getWorkspace(workspaceId: string) {
  return http.get<ApiWorkspace>(`/workspaces/${workspaceId}`);
}

export function updateWorkspaceOrganization(workspaceId: string, input: Partial<OrganizationInfo>) {
  return http.patch<ApiWorkspace>(`/workspaces/${workspaceId}`, input);
}

export type MeResponse = {
  user: { id: string; name: string; email: string; status: string };
  workspaces: { workspace: ApiWorkspace; role: string; capabilities: string[] }[];
};

/** Session restoration and onboarding resume both start here. */
export function getMe() {
  return http.get<MeResponse>("/me");
}
