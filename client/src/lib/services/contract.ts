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
  FallbackBehaviour,
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
  IssueStatus,
  ReviewIssue,
  RolePreset,
  Scenario,
  ScenarioSuite,
  Scope,
  SimulationRun,
  Tool,
  UsageSnapshot,
  User,
  Workspace,
} from "@/lib/domain/types";

export type ConversationFilters = {
  scope?: Scope;
  /** "live" means status is ringing, active, waiting or wrapping. */
  live?: boolean;
  employeeId?: string;
  partyId?: string;
  /** Conversations that ran a given procedure — its execution history. */
  procedureId?: string;
  outcome?: Conversation["outcome"][];
  channel?: Conversation["channel"][];
  search?: string;
  limit?: number;
};

export type RecordFilters = {
  scope?: Scope;
  partyId?: string;
  archetype?: DomainRecord["archetype"][];
  /** Raw status tokens, matching `DomainRecord.status`. */
  status?: string[];
  /** Matches the type, the status, and the values of any field. */
  search?: string;
  /**
   * Only records a conversation produced. The distinction this surface exists
   * to make: what the AI did, against what was already in the diary.
   */
  createdByAiOnly?: boolean;
};

export type PerformanceFilters = {
  /** Defaults to 7d. Both ranges are cut from the same history. */
  range?: "7d" | "30d";
  scope?: Scope;
};

export type PartyFilters = {
  scope?: Scope;
  /** Matches name, phone, email and both halves of any fact. */
  search?: string;
  /**
   * Only people carrying a fact the AI inferred or could not verify — the
   * queue behind this screen's primary action.
   */
  unconfirmedOnly?: boolean;
  limit?: number;
};

/**
 * A fact is addressed by its label rather than an id: the label is the
 * question ("Date of birth"), and a record holds one answer per question.
 * `source` is deliberately absent — a person confirming or correcting a fact
 * always produces a verified one, and letting a caller pass any provenance
 * would make provenance meaningless.
 */
export type PartyFactEdit = {
  partyId: string;
  label: string;
  /** Omitted when confirming the value already on the record. */
  value?: string;
};

/**
 * Settling a contradiction between two sources.
 *
 * The decision *is* the write: nothing is edited, deleted or merged. One of the
 * sources already making a claim on the topic becomes the one the AI answers
 * from, and the other stays on the record — a source that was wrong once is
 * evidence, and deleting it would hide why the decision was needed.
 */
export type ConflictResolution = {
  conflictId: string;
  /** Must be a source already making a claim on this conflict. */
  sourceId: string;
};

/**
 * Writing the answer to a question nothing covers.
 *
 * The question is the gap's own — a gap records what callers actually asked, in
 * their words, and rewording it here would quietly change what the new answer
 * is an answer *to*.
 */
export type GapAnswer = {
  gapId: string;
  answer: string;
};

/** The draft the answer became, and the gap now pointing at it. */
export type GapAnswered = {
  gap: KnowledgeGap;
  item: KnowledgeItem;
};

/**
 * Publishing a draft.
 *
 * The note is not optional and has no default. It is the entry a person reads
 * six weeks later asking why the AI started saying something different, and a
 * server-generated summary of the diff cannot answer that — the diff is
 * already stored, the reasoning is not.
 *
 * `acknowledgedFindingIds` carries the scenario ids whose simulation findings
 * the publisher accepted. Sending them explicitly rather than a single
 * "override" flag means the record shows *which* unresolved findings someone
 * decided to ship past, and a finding that appears between loading the screen
 * and pressing publish is not silently covered by a stale acknowledgement.
 */
export type PublishRequest = {
  releaseId: string;
  note: string;
  acknowledgedFindingIds: string[];
};

/**
 * A reason is required. A rollback is the most consequential thing on the
 * Releases surface — it changes what customers hear on the next call — and an
 * unexplained one in the history is an alarm nobody can act on.
 */
export type RollbackRequest = {
  releaseId: string;
  reason: string;
};

/**
 * A run is always against one specific version, and the version is the
 * caller's to state rather than the server's to infer. "Simulate the draft"
 * looks like the obvious API until the draft is edited mid-run, at which point
 * a server-inferred version silently changes what the results are evidence
 * about. Naming it here means a run's verdict can never drift off the thing
 * that was actually rehearsed.
 */
export type SimulationRunInput = {
  suiteId: string;
  employeeId: string;
  employeeVersionId: string;
};

/**
 * Assigning a preset replaces the person's capability set with that preset's —
 * that is what a preset *is*, and it is why the operation names a role rather
 * than a list of permissions. Granting a single capability by hand is a
 * different operation and deliberately does not exist: it is what produced the
 * drift this screen reports, and re-offering it before there is an audit trail
 * behind it would just manufacture more.
 */
export type RoleAssignment = {
  userId: string;
  role: RolePreset;
};

export type ProcedureStepRef = {
  procedureId: string;
  stepId: string;
};

/**
 * Rewriting one step.
 *
 * The prose only. A step's kind, the action it calls and the authority it
 * exercises are structural — changing those changes what the AI *does*, not
 * what it says while doing it, and it is a different and larger operation than
 * correcting a sentence. Keeping them out of this edit is what lets the rewrite
 * be a low-ceremony draft rather than a schema migration with a text box on it.
 *
 * Both fields are sent together and neither is optional: the instruction and
 * its fallback are one thought, and a rewrite that improves the first while
 * leaving a stale second behind is the most common way a procedure ends up
 * self-contradictory.
 */
export type ProcedureStepEdit = ProcedureStepRef & {
  instruction: string;
  fallback: string;
};

/** The result of an audit export: the file, its name, and the entry it wrote. */
export type AuditExport = {
  csv: string;
  filename: string;
  /** The `audit.export` event the server recorded for this download. */
  recorded: AuditEvent;
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

/**
 * Deliberately the whole fallback rather than a patch. The three kinds carry
 * different payloads, and a partial update is how a deployment ends up
 * claiming to forward with no number to forward to — a failure that only
 * shows itself at 19:41 when somebody rings.
 */
export type FallbackEdit = {
  deploymentId: string;
  fallback: FallbackBehaviour;
};

/**
 * The whole cap policy, not a patch, for the same reason as `FallbackEdit`:
 * a cap behaviour with no budget to trigger it, or a budget with no chosen
 * behaviour at the cap, is a state §3.12 says must never be reachable.
 */
export type BudgetUpdate = {
  /** Minor units. Null removes the cap — spend is tracked but nothing stops it. */
  budgetMonth: number | null;
  atCap: UsageSnapshot["atCap"];
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

  // GET /v1/parties
  listParties(filters?: PartyFilters): Promise<Party[]>;
  // GET /v1/parties/:id
  getParty(id: string): Promise<Party | null>;
  // POST /v1/parties/:id/facts/:label/confirm  → the updated party
  confirmPartyFact(edit: PartyFactEdit): Promise<Party>;
  // PATCH /v1/parties/:id/facts/:label  → the updated party
  correctPartyFact(edit: Required<PartyFactEdit>): Promise<Party>;
  // GET /v1/records
  listRecords(filters?: RecordFilters): Promise<DomainRecord[]>;
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
  /**
   * Every action every connection exposes, in one call rather than one per
   * connection. The Tools surface reads them together — an action's health is
   * only meaningful next to the other actions on the same connection — and a
   * per-integration endpoint would make that a waterfall.
   */
  // GET /v1/tools
  listTools(): Promise<Tool[]>;
  // GET /v1/procedures
  listProcedures(): Promise<Procedure[]>;
  // GET /v1/procedures/:id
  getProcedure(id: string): Promise<Procedure | null>;
  // PUT /v1/procedures/:id/steps/:stepId/draft  → the updated procedure
  editProcedureStep(edit: ProcedureStepEdit): Promise<Procedure>;
  // DELETE /v1/procedures/:id/steps/:stepId/draft  → the updated procedure
  discardProcedureStepDraft(ref: ProcedureStepRef): Promise<Procedure>;

  // GET /v1/usage/current
  getUsage(): Promise<UsageSnapshot>;
  // PUT /v1/usage/budget  { budgetMonth, atCap }  → the updated snapshot
  setBudget(update: BudgetUpdate): Promise<UsageSnapshot>;
  // GET /v1/health  (also the websocket heartbeat payload)
  getConnectionHealth(): Promise<ConnectionHealth>;
  // GET /v1/audit
  listAuditEvents(limit?: number): Promise<AuditEvent[]>;
  /**
   * POST /v1/audit/export → the file, and the entry the export itself created.
   *
   * Reading the audit log is an auditable act, so the server both produces the
   * file and records having done so, in one call. The client is given the
   * resulting event rather than writing one: a log that accepted client-authored
   * rows would be evidence of nothing. Ids are passed explicitly so what lands
   * in the file is exactly what the person was looking at when they asked.
   */
  exportAuditEvents(eventIds: string[]): Promise<AuditExport>;

  // GET /v1/briefing?scope=…  — server-composed; see Briefing above
  getBriefing(scope?: Scope): Promise<Briefing>;

  // GET /v1/knowledge/items?sourceId=…
  listKnowledgeItems(sourceId?: string): Promise<KnowledgeItem[]>;
  // GET /v1/knowledge/conflicts
  listKnowledgeConflicts(): Promise<KnowledgeConflict[]>;
  // GET /v1/knowledge/gaps
  listKnowledgeGaps(): Promise<KnowledgeGap[]>;
  // POST /v1/knowledge/conflicts/:id/resolve  → the conflict, now decided
  resolveKnowledgeConflict(
    resolution: ConflictResolution,
  ): Promise<KnowledgeConflict>;
  // POST /v1/knowledge/gaps/:id/answer  → the draft it created
  answerKnowledgeGap(answer: GapAnswer): Promise<GapAnswered>;

  // GET /v1/simulation/suites
  listScenarioSuites(): Promise<ScenarioSuite[]>;
  // GET /v1/simulation/scenarios
  listScenarios(): Promise<Scenario[]>;
  // GET /v1/simulation/runs
  listSimulationRuns(): Promise<SimulationRun[]>;
  // POST /v1/simulation/runs  → the run, status "running", results empty
  startSimulationRun(input: SimulationRunInput): Promise<SimulationRun>;
  // GET /v1/simulation/runs/:id  — polled while the run is in flight
  getSimulationRun(id: string): Promise<SimulationRun | null>;

  // GET /v1/employees/:id/releases
  listReleases(employeeId?: string): Promise<Release[]>;
  // POST /v1/releases/:id/publish  → the now-published release
  publishRelease(request: PublishRequest): Promise<Release>;
  // POST /v1/releases/:id/rollback → the now-rolled-back release
  rollbackRelease(request: RollbackRequest): Promise<Release>;

  // GET /v1/channels/numbers
  listPhoneNumbers(): Promise<PhoneNumber[]>;
  // PUT /v1/channels/deployments/:id/fallback  → the employee that owns it
  setDeploymentFallback(edit: FallbackEdit): Promise<AIEmployee>;
  // GET /v1/compliance/gates
  listComplianceGates(): Promise<ComplianceGate[]>;
  // GET /v1/compliance/retention
  listRetentionPolicies(): Promise<RetentionPolicy[]>;
  // GET /v1/people/oncall
  listOnCall(): Promise<OnCallEntry[]>;
  // PATCH /v1/users/:id  { role }  → the updated person
  assignRole(assignment: RoleAssignment): Promise<User>;
  // PUT /v1/people/oncall/primary  { userId }  → the whole rota, re-pointed
  setOnCallPrimary(userId: string): Promise<OnCallEntry[]>;

  // GET /v1/performance?range=7d&locationId=…
  getPerformance(filters?: PerformanceFilters): Promise<PerformanceSummary>;

  // GET /v1/review/issues/:id
  getReviewIssue(id: string): Promise<ReviewIssue | null>;
  /**
   * PATCH /v1/review/issues/:id  { status }  → the updated cause
   *
   * Triage, not repair: this records a judgement about the cause and changes
   * nothing about what the AI employee says or does. The change that stops a
   * cause recurring is made in Build, against a draft that has to simulate
   * green before a customer meets it.
   */
  updateReviewIssueStatus(id: string, status: IssueStatus): Promise<ReviewIssue>;
}
