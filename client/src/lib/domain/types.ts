/**
 * The Humanoid object model.
 *
 * This file is the executable form of interface-architecture.md §5. Types here
 * are the contract the mock services satisfy today and the real API must
 * satisfy later — so they are written as the API should shape them, not as any
 * one screen happens to need them.
 */

import type { IndustryPackId, LexiconOverrides } from "@/lib/lexicon";

// ─────────────────────────────────────────────────────────────────────────────
// Organisation
// ─────────────────────────────────────────────────────────────────────────────

export type Workspace = {
  id: string;
  name: string;
  industry: IndustryPackId | null;
  lexiconOverrides: LexiconOverrides;
  /** Drives which compliance gates block deployment. */
  regulatoryProfile: "standard" | "healthcare" | "financial" | "legal";
  timezone: string;
  currency: string;
};

export type Location = {
  id: string;
  workspaceId: string;
  name: string;
  /** Short form for the scope selector and dense table cells. */
  code: string;
  timezone: string;
  address: string;
  departmentIds: string[];
};

export type Department = {
  id: string;
  name: string;
  locationIds: string[];
};

/** Global scope. Every list, metric and live count in the product respects it. */
export type Scope = {
  locationId: string | null;
  departmentId: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// AI employees
// ─────────────────────────────────────────────────────────────────────────────

export type Channel = "voice" | "sms" | "whatsapp" | "webchat" | "email";

export type EmployeeStatus =
  | "live"
  | "paused"
  | "draft"
  | "scheduled"
  | "degraded";

export type Persona = {
  name: string;
  role: string;
  /** How the AI introduces itself, including its AI disclosure. */
  greeting: string;
  voiceId: string;
  languages: string[];
  /** 0–100 scales surfaced in the voice studio as labelled sliders. */
  warmth: number;
  formality: number;
  pace: number;
};

export type Deployment = {
  id: string;
  channel: Channel;
  /** E.164 for voice/SMS, address for email, widget id for webchat. */
  endpoint: string;
  locationId: string | null;
  hours: OperatingHours;
  /** What happens when the employee is paused, over budget, or out of hours. */
  fallback: FallbackBehaviour;
};

export type OperatingHours = {
  /** Keyed 0 (Sunday) – 6. Absent day means closed. */
  days: Partial<Record<number, { open: string; close: string }>>;
  alwaysOn: boolean;
};

export type FallbackBehaviour =
  | { kind: "voicemail" }
  | { kind: "forward"; to: string }
  | { kind: "announce"; message: string };

export type EmployeeVersion = {
  id: string;
  version: number;
  state: "draft" | "live" | "archived";
  persona: Persona;
  grants: Grants;
  authority: CapabilityGrant[];
  publishedAt: string | null;
  publishedBy: string | null;
  /** Required at publish. Appears in the release history and audit trail. */
  changeNote: string | null;
};

/** Employees are granted workspace assets; they never own them. (§3.1) */
export type Grants = {
  knowledgeCollectionIds: string[];
  procedureIds: string[];
  toolIds: string[];
  policyIds: string[];
};

export type AIEmployee = {
  id: string;
  workspaceId: string;
  status: EmployeeStatus;
  liveVersion: EmployeeVersion | null;
  draftVersion: EmployeeVersion | null;
  deployments: Deployment[];
  supervisorUserIds: string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Authority — what the AI is allowed to do (§3.11)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Autonomy is per capability, never per employee. The ladder is ordered; UI
 * relies on the index for comparisons like "is this a promotion?".
 */
export const AUTONOMY_LEVELS = [
  "observe",
  "suggest",
  "approve",
  "act",
  "act_notify",
] as const;

export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

export type CapabilityId =
  | "book_visit"
  | "reschedule_visit"
  | "cancel_visit"
  | "answer_from_knowledge"
  | "collect_intake"
  | "verify_identity"
  | "send_confirmation"
  | "create_case"
  | "update_party_record"
  | "transfer_call"
  | "take_payment"
  | "clinical_advice";

export type CapabilityGrant = {
  capabilityId: CapabilityId;
  autonomy: AutonomyLevel;
  limits: CapabilityLimits;
  /** User ids permitted to approve, when autonomy is "approve". */
  approverUserIds: string[];
  /**
   * Capabilities a business owner cannot enable alone. Rendered as locked with
   * the reason shown — never silently hidden, because the question "can it take
   * card numbers?" deserves a visible, explained "no".
   */
  hardBlocked: boolean;
  hardBlockReason: string | null;
};

export type CapabilityLimits = {
  perCall: number | null;
  perDay: number | null;
  /** Currency minor units, for capabilities that move money. */
  valueCap: number | null;
  requiresVerifiedIdentity: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Conversations
// ─────────────────────────────────────────────────────────────────────────────

/** Who is driving. The single most important state in the product. (§11.1) */
export type ControlState = "ai" | "human" | "transferring" | "ended";

/** Sub-state of AI control. Shown by motion and label, never a different hue. */
export type AIActivity = "listening" | "thinking" | "speaking" | "idle";

export type ConversationStatus =
  | "ringing"
  | "active"
  | "waiting"
  | "wrapping"
  | "ended";

export type ConversationOutcome =
  | "resolved"
  | "escalated"
  | "abandoned"
  | "failed"
  | "in_progress";

/** Replaces a confidence percentage. (§3.2) */
export type GroundingState =
  | "grounded"
  | "policy"
  | "inferred"
  | "unsupported";

/** Every escalation names one of these. Each maps to a specific fix. */
export type BlockerType =
  | "identity_unverified"
  | "ambiguous_intent"
  | "conflicting_sources"
  | "tool_failed"
  | "out_of_scope"
  | "policy_requires_human"
  | "customer_requested_human"
  | "emotional_distress";

export type Turn = {
  id: string;
  at: string;
  speaker: "ai" | "customer" | "human_agent" | "system";
  text: string;
  /** Present on AI turns only. */
  grounding?: GroundingState;
  /** Knowledge items that grounded this turn, for the citation affordance. */
  citationIds?: string[];
};

export type ActionStatus =
  | "pending_approval"
  | "running"
  | "completed"
  | "failed"
  | "rejected"
  | "skipped";

export type ConversationAction = {
  id: string;
  at: string;
  capabilityId: CapabilityId;
  label: string;
  status: ActionStatus;
  /** Why this ran: the rule, procedure step or request that caused it. */
  reason: string;
  /** Present when status is "failed" — shown verbatim, never swallowed. */
  error: string | null;
  /** Set when autonomy was "approve". */
  approvedByUserId: string | null;
  approvedAt: string | null;
  /** Record this action created or changed, if any. */
  recordId: string | null;
};

export type ProcedureRunStep = {
  id: string;
  label: string;
  status: "pending" | "active" | "complete" | "skipped" | "failed";
};

export type Intervention = {
  id: string;
  at: string;
  kind: "monitor" | "coach" | "takeover" | "transfer" | "return_to_ai";
  userId: string;
  note: string | null;
};

export type Conversation = {
  id: string;
  workspaceId: string;
  locationId: string;
  employeeId: string;
  channel: Channel;
  direction: "inbound" | "outbound";
  status: ConversationStatus;
  control: ControlState;
  activity: AIActivity;
  startedAt: string;
  endedAt: string | null;
  partyId: string | null;
  /** Caller id before the party is identified. */
  fromLabel: string;
  intent: string | null;
  outcome: ConversationOutcome;
  /** Named reason if escalated. */
  blocker: BlockerType | null;
  escalatedToUserId: string | null;
  summary: string | null;
  turns: Turn[];
  actions: ConversationAction[];
  procedureRun: {
    procedureId: string;
    steps: ProcedureRunStep[];
  } | null;
  interventions: Intervention[];
  recordingAvailable: boolean;
  /** Set when the customer withheld consent — playback must be blocked. */
  recordingConsent: "granted" | "declined" | "not_required";
  /** Effort signals. Preferred over sentiment as headline metrics. (§3.8) */
  effort: {
    clarificationTurns: number;
    repeats: number;
    durationSeconds: number;
  };
  sentiment: "positive" | "neutral" | "negative" | null;
  followUpTaskIds: string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Parties and records
// ─────────────────────────────────────────────────────────────────────────────

/** Provenance is part of the model: users must see what is actually verified. */
export type FactSource = "verified" | "imported" | "ai_inferred" | "unverified";

export type PartyFact = {
  label: string;
  value: string;
  source: FactSource;
  updatedAt: string;
};

export type Party = {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  preferredLanguage: string;
  facts: PartyFact[];
  consent: {
    recording: "granted" | "declined" | "unknown";
    marketing: "granted" | "declined" | "unknown";
    updatedAt: string | null;
  };
  createdAt: string;
  lastContactAt: string | null;
};

/** The six archetypes. One set of components renders all of them. (§5.4) */
export type RecordArchetype =
  | "visit"
  | "case"
  | "lead"
  | "order"
  | "party"
  | "resource";

export type DomainRecord = {
  id: string;
  archetype: RecordArchetype;
  /** Industry-specific type within the archetype, e.g. "consultation". */
  typeId: string;
  locationId: string;
  partyId: string | null;
  status: string;
  /** Schema-driven; rendered by the archetype layout, labelled by the pack. */
  fields: Record<string, string | number | boolean | null>;
  scheduledAt: string | null;
  resourceId: string | null;
  createdByConversationId: string | null;
  createdAt: string;
};

export type Resource = {
  id: string;
  name: string;
  kind: string;
  locationId: string;
  departmentId: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Review — the single asynchronous work queue (§3.9, §5.3)
// ─────────────────────────────────────────────────────────────────────────────

export type IssueCause =
  | "missing_knowledge"
  | "conflicting_knowledge"
  | "stale_knowledge"
  | "procedure_gap"
  | "procedure_error"
  | "tool_failure"
  | "policy_ambiguity"
  | "transcription_failure"
  | "unclear_scope"
  | "autonomy_too_low"
  | "autonomy_too_high";

export type IssueSeverity = "critical" | "high" | "medium" | "low";

export type ReviewIssue = {
  id: string;
  cause: IssueCause;
  title: string;
  detail: string;
  severity: IssueSeverity;
  status: "open" | "in_progress" | "resolved" | "dismissed";
  /** Blast radius drives ranking: fix the thing affecting the most calls. */
  affectedConversationCount: number;
  evidenceConversationIds: string[];
  employeeId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  proposedFix: ProposedFix | null;
  assignedToUserId: string | null;
};

/**
 * Proposals are never applied automatically. They land in a draft, which must
 * simulate green before it can be published. (§3.10, J6)
 */
export type ProposedFix = {
  kind:
    | "add_knowledge"
    | "edit_knowledge"
    | "resolve_conflict"
    | "edit_procedure"
    | "adjust_autonomy"
    | "reconnect_tool";
  summary: string;
  /** Human-readable before/after for the diff view. */
  before: string | null;
  after: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Approvals — interrupts, not a queue (Phase 2 refinement of §3.9)
// ─────────────────────────────────────────────────────────────────────────────

export type ApprovalRequest = {
  id: string;
  conversationId: string;
  capabilityId: CapabilityId;
  label: string;
  /** Enough context to decide responsibly. Never a bare "Approve?" prompt. */
  context: { label: string; value: string }[];
  requestedAt: string;
  /** Live calls cannot wait. Drives the countdown and the auto-deny fallback. */
  expiresAt: string | null;
  status: "pending" | "approved" | "denied" | "expired";
  requiredCapability: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Knowledge, tools, procedures
// ─────────────────────────────────────────────────────────────────────────────

export type KnowledgeSourceKind =
  | "website"
  | "document"
  | "faq"
  | "manual"
  | "recording"
  | "integration";

export type KnowledgeSource = {
  id: string;
  kind: KnowledgeSourceKind;
  name: string;
  origin: string;
  status: "syncing" | "ready" | "error" | "stale";
  itemCount: number;
  lastSyncedAt: string | null;
  error: string | null;
  /** Number of unresolved contradictions against other sources. */
  conflictCount: number;
  collectionId: string;
};

export type Integration = {
  id: string;
  name: string;
  vendor: string;
  status: "connected" | "degraded" | "disconnected" | "error";
  lastCheckedAt: string;
  /** Actions this integration exposes as tools. */
  toolIds: string[];
  scopes: string[];
  error: string | null;
};

export type Procedure = {
  id: string;
  name: string;
  description: string;
  trigger: string;
  stepCount: number;
  status: "active" | "draft";
  /** Rolling completion rate, used by Review to spot degradation. */
  completionRate: number;
  runCount: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// People, audit, usage
// ─────────────────────────────────────────────────────────────────────────────

export type RolePreset = "owner" | "operator" | "builder" | "governor";

export type DisclosureLevel = "standard" | "advanced" | "developer";

export type User = {
  id: string;
  name: string;
  email: string;
  role: RolePreset;
  capabilities: string[];
  locationIds: string[];
  onCall: boolean;
};

export type AuditEvent = {
  id: string;
  at: string;
  actor: { kind: "user" | "ai" | "system"; id: string; label: string };
  action: string;
  target: string;
  detail: string;
};

export type UsageSnapshot = {
  /** Minor units, in workspace currency. */
  spendToday: number;
  spendMonth: number;
  budgetMonth: number | null;
  /** What happens at the cap. An explicit, visible choice. (§3.12) */
  atCap: "notify" | "voicemail" | "stop";
  callsToday: number;
  costPerResolution: number;
};

/** Real-time transport health. Degraded is a designed state, not a toast. */
export type ConnectionHealth = {
  realtime: "connected" | "degraded" | "offline";
  telephony: "connected" | "degraded" | "offline";
  lastUpdatedAt: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Knowledge detail
// ─────────────────────────────────────────────────────────────────────────────

export type KnowledgeItem = {
  id: string;
  sourceId: string;
  question: string;
  answer: string;
  /** Times this item grounded an answer in the last 30 days. */
  useCount: number;
  updatedAt: string;
  status: "approved" | "draft" | "stale";
};

/**
 * A contradiction between two approved sources. Surfaced at ingest and blocking
 * until resolved: two sources that disagree produce confidently wrong answers,
 * which is the most damaging failure knowledge can have.
 */
export type KnowledgeConflict = {
  id: string;
  topic: string;
  status: "unresolved" | "resolved";
  claims: { sourceId: string; sourceName: string; claim: string }[];
  /** Which source wins, once someone decides. */
  resolvedSourceId: string | null;
  lastAskedAt: string;
  askCount: number;
};

/** A question customers ask that no approved source answers. */
export type KnowledgeGap = {
  id: string;
  question: string;
  askCount: number;
  lastAskedAt: string;
  /** What the AI did instead — always declining, never guessing. */
  fallbackBehaviour: string;
  linkedIssueId: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Simulation
// ─────────────────────────────────────────────────────────────────────────────

export type Scenario = {
  id: string;
  suiteId: string;
  name: string;
  /** What the simulated caller wants. */
  intent: string;
  /** Why this scenario exists — usually a real failure it was seeded from. */
  origin: "seeded_from_failure" | "authored" | "generated";
  difficulty: "routine" | "awkward" | "adversarial";
  expectation: string;
};

export type ScenarioSuite = {
  id: string;
  name: string;
  description: string;
  scenarioIds: string[];
};

export type ScenarioResult = {
  scenarioId: string;
  status: "passed" | "failed" | "warning" | "skipped";
  /** Named, actionable — never a score. */
  finding: string | null;
  durationSeconds: number;
};

export type SimulationRun = {
  id: string;
  suiteId: string;
  employeeId: string;
  employeeVersionId: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "complete" | "cancelled";
  results: ScenarioResult[];
  triggeredByUserId: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Releases
// ─────────────────────────────────────────────────────────────────────────────

export type ReleaseChange = {
  area: "persona" | "knowledge" | "procedure" | "tool" | "authority" | "policy";
  summary: string;
  before: string | null;
  after: string;
  /** Changes that alter what the AI may do alone need extra scrutiny. */
  raisesAuthority: boolean;
};

export type Release = {
  id: string;
  employeeId: string;
  version: number;
  state: "published" | "rolled_back" | "draft";
  publishedAt: string | null;
  publishedByUserId: string | null;
  note: string;
  changes: ReleaseChange[];
  /** The simulation run that gated this publish. */
  simulationRunId: string | null;
  rolledBackAt: string | null;
  rolledBackReason: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Channels, compliance, performance
// ─────────────────────────────────────────────────────────────────────────────

export type PhoneNumber = {
  id: string;
  e164: string;
  label: string;
  locationId: string | null;
  employeeId: string | null;
  status: "active" | "provisioning" | "unassigned";
  capabilities: ("voice" | "sms")[];
  monthlyCost: number;
};

/**
 * A compliance requirement that blocks deployment rather than living in
 * settings. In regulated verticals these are gates, not preferences.
 */
export type ComplianceGate = {
  id: string;
  name: string;
  detail: string;
  status: "met" | "action_needed" | "not_applicable";
  /** What has to happen to clear it. */
  requirement: string;
  ownerUserId: string | null;
  lastReviewedAt: string | null;
};

export type RetentionPolicy = {
  id: string;
  dataType: string;
  retainForDays: number;
  /** Whether recordings/transcripts are kept at all. */
  enabled: boolean;
  legalBasis: string;
};

export type OnCallEntry = {
  id: string;
  userId: string;
  startsAt: string;
  endsAt: string;
  /** Who receives an escalation if the primary does not answer. */
  isPrimary: boolean;
};

export type PerformancePoint = {
  /** ISO date. */
  at: string;
  calls: number;
  resolved: number;
  escalated: number;
  failed: number;
  /** Seconds. */
  medianHandleTime: number;
};

export type PerformanceSummary = {
  range: "7d" | "30d";
  points: PerformancePoint[];
  /** Escalations grouped by named blocker — the actionable cut. */
  blockerBreakdown: { blocker: BlockerType; count: number }[];
  /** Which procedures are losing calls. */
  procedureHealth: {
    procedureId: string;
    name: string;
    runs: number;
    completionRate: number;
    trend: "up" | "down" | "flat";
  }[];
};
