import { http } from "./client";

/** Shapes returned by the backend's usage module, one-to-one with the API. */
export type ApiUsageSnapshot = {
  spendToday: number;
  spendMonth: number;
  budgetMonth: number | null;
  atCap: string;
  callsToday: number;
  costPerResolution: number;
  meter: {
    capReached: boolean;
    connectedMinutesMonth: number;
    callsMonth: number;
    resolvedCallsMonth: number;
    modelTokensMonth: number | null;
    unmeteredCalls: number;
    rates: {
      voicePerMinute: number;
      modelInputPerMillionTokens: number;
      modelOutputPerMillionTokens: number;
    };
    currency: string;
  };
  capBlocked: Record<string, string>;
};

export function getUsage(workspaceId: string) {
  return http.get<ApiUsageSnapshot>(`/workspaces/${workspaceId}/usage`);
}

/**
 * Takes effect immediately — there is no draft and no release to publish,
 * which is why the screen says so above the control rather than after it.
 */
export function setBudget(
  workspaceId: string,
  body: { budgetMonth: number | null; atCap: string },
) {
  return http.put<ApiUsageSnapshot>(`/workspaces/${workspaceId}/usage/budget`, body);
}
