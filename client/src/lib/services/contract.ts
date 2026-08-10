/**
 * The service contract.
 *
 * This interface is the API contract. The mock implementation satisfies it
 * today; an HTTP implementation will satisfy it later without any screen
 * changing. Each method carries the endpoint it will map to, so the contract
 * stays reviewable alongside the backend work.
 *
 * Rules:
 * - Every method is async and can fail. Screens handle loading and error.
 * - Filters are explicit objects, never positional arguments.
 * - Nothing here returns a view model. Shaping for a screen happens in the
 *   screen, so that two screens can use the same call differently.
 */

import type {
  AIEmployee,
  ApprovalRequest,
  AuditEvent,
  ComplianceGate,
  ConnectionHealth,
  Conversation,
  Department,
  DomainRecord,
  Integration,
  KnowledgeConflict,
  KnowledgeGap,
  KnowledgeItem,
  KnowledgeSource,
  Location,
  OnCallEntry,
  Party,
  PerformanceSummary,
  PhoneNumber,
  Procedure,
  Release,
  Resource,
  RetentionPolicy,
  ReviewIssue,
  Scenario,
  ScenarioSuite,
  Scope,
  SimulationRun,
  UsageSnapshot,
  User,
  Workspace,
} from "@/lib/domain/types";

export type ConversationFilters = {
  scope?: Scope;
  /** "live" means status is ringing, active, waiting or wrapping. */
  live?: boolean;
  employeeId?: string;
  outcome?: Conversation["outcome"][];
  channel?: Conversation["channel"][];
  search?: string;
  limit?: number;
};

export type BriefingSince = {
  calls: number;
  booked: number;
  rescheduled: number;
  escalated: number;
  unresolvedEscalations: number;
  resolvedRate: number;
  /** Same figures for the previous comparable period, for the delta. */
  previous: { calls: number; resolvedRate: number };
};

export type Briefing = {
  generatedAt: string;
  live: {
    active: number;
    waiting: number;
    ringing: number;
    needsApproval: number;
  };
  since: BriefingSince;
  /** Top issues by blast radius. The full list lives in Review. */
  topIssues: ReviewIssue[];
  pendingApprovals: ApprovalRequest[];
  /** Things worth knowing that are not yet problems. */
  signals: {
    id: string;
    kind: "opportunity" | "risk" | "trend";
    text: string;
    href: string | null;
  }[];
};

export interface HumanoidService {
  // GET /v1/workspace
  getWorkspace(): Promise<Workspace>;
  // GET /v1/locations
  listLocations(): Promise<Location[]>;
  // GET /v1/departments
  listDepartments(): Promise<Department[]>;
  // GET /v1/me
  getCurrentUser(): Promise<User>;
  // GET /v1/users
  listUsers(): Promise<User[]>;

  // GET /v1/employees
  listEmployees(): Promise<AIEmployee[]>;
  // GET /v1/employees/:id
  getEmployee(id: string): Promise<AIEmployee | null>;

  // GET /v1/conversations
  listConversations(filters?: ConversationFilters): Promise<Conversation[]>;
  // GET /v1/conversations/:id
  getConversation(id: string): Promise<Conversation | null>;

  // GET /v1/parties/:id
  getParty(id: string): Promise<Party | null>;
  // GET /v1/records
  listRecords(scope?: Scope): Promise<DomainRecord[]>;
  // GET /v1/resources
  listResources(): Promise<Resource[]>;

  // GET /v1/review/issues
  listReviewIssues(scope?: Scope): Promise<ReviewIssue[]>;
  // GET /v1/approvals?status=pending
  listPendingApprovals(): Promise<ApprovalRequest[]>;

  // GET /v1/knowledge/sources
  listKnowledgeSources(): Promise<KnowledgeSource[]>;
  // GET /v1/integrations
  listIntegrations(): Promise<Integration[]>;
  // GET /v1/procedures
  listProcedures(): Promise<Procedure[]>;

  // GET /v1/usage/current
  getUsage(): Promise<UsageSnapshot>;
  // GET /v1/health  (also the websocket heartbeat payload)
  getConnectionHealth(): Promise<ConnectionHealth>;
  // GET /v1/audit
  listAuditEvents(limit?: number): Promise<AuditEvent[]>;

  // GET /v1/briefing?scope=…  — server-composed; see Briefing above
  getBriefing(scope?: Scope): Promise<Briefing>;

  // GET /v1/knowledge/items?sourceId=…
  listKnowledgeItems(sourceId?: string): Promise<KnowledgeItem[]>;
  // GET /v1/knowledge/conflicts
  listKnowledgeConflicts(): Promise<KnowledgeConflict[]>;
  // GET /v1/knowledge/gaps
  listKnowledgeGaps(): Promise<KnowledgeGap[]>;

  // GET /v1/simulation/suites
  listScenarioSuites(): Promise<ScenarioSuite[]>;
  // GET /v1/simulation/scenarios
  listScenarios(): Promise<Scenario[]>;
  // GET /v1/simulation/runs
  listSimulationRuns(): Promise<SimulationRun[]>;

  // GET /v1/employees/:id/releases
  listReleases(employeeId?: string): Promise<Release[]>;

  // GET /v1/channels/numbers
  listPhoneNumbers(): Promise<PhoneNumber[]>;
  // GET /v1/compliance/gates
  listComplianceGates(): Promise<ComplianceGate[]>;
  // GET /v1/compliance/retention
  listRetentionPolicies(): Promise<RetentionPolicy[]>;
  // GET /v1/people/oncall
  listOnCall(): Promise<OnCallEntry[]>;

  // GET /v1/performance?range=7d
  getPerformance(range?: "7d" | "30d"): Promise<PerformanceSummary>;

  // GET /v1/review/issues/:id
  getReviewIssue(id: string): Promise<ReviewIssue | null>;
}
