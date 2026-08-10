/**
 * Service selection.
 *
 * Screens import `service` from here and never import the mock directly, so
 * swapping in the HTTP implementation is a one-line change in this file.
 */

import type { HumanoidService } from "./contract";
import { mockService } from "./mock";

export const service: HumanoidService = mockService;

export type * from "./contract";

/** Query keys, centralised so invalidation stays consistent. */
export const qk = {
  workspace: ["workspace"] as const,
  locations: ["locations"] as const,
  departments: ["departments"] as const,
  me: ["me"] as const,
  users: ["users"] as const,
  employees: ["employees"] as const,
  employee: (id: string) => ["employees", id] as const,
  conversations: (filters?: unknown) => ["conversations", filters] as const,
  conversation: (id: string) => ["conversations", id] as const,
  party: (id: string) => ["parties", id] as const,
  records: (scope?: unknown) => ["records", scope] as const,
  issues: (scope?: unknown) => ["review", "issues", scope] as const,
  approvals: ["approvals", "pending"] as const,
  knowledgeSources: ["knowledge", "sources"] as const,
  integrations: ["integrations"] as const,
  procedures: ["procedures"] as const,
  usage: ["usage"] as const,
  health: ["health"] as const,
  audit: ["audit"] as const,
  briefing: (scope?: unknown) => ["briefing", scope] as const,
  knowledgeItems: (sourceId?: string) =>
    ["knowledge", "items", sourceId ?? "all"] as const,
  knowledgeConflicts: ["knowledge", "conflicts"] as const,
  knowledgeGaps: ["knowledge", "gaps"] as const,
  scenarioSuites: ["simulation", "suites"] as const,
  scenarios: ["simulation", "scenarios"] as const,
  simulationRuns: ["simulation", "runs"] as const,
  releases: (employeeId?: string) =>
    ["releases", employeeId ?? "all"] as const,
  phoneNumbers: ["channels", "numbers"] as const,
  complianceGates: ["compliance", "gates"] as const,
  retention: ["compliance", "retention"] as const,
  onCall: ["people", "oncall"] as const,
  performance: (range?: string) => ["performance", range ?? "7d"] as const,
  issue: (id: string) => ["review", "issues", id] as const,
};
