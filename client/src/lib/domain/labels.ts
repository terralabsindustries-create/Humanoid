/**
 * Human-readable labels for every enum in the model.
 *
 * No raw enum value ever reaches the screen. These are operational phrasings —
 * specific, plain, and honest about failure. "Calendar did not respond" beats
 * "tool_failed", and both beat "Something went wrong".
 *
 * These are not lexicon entries: they mean the same thing in every industry.
 */

import type {
  ActionStatus,
  AIActivity,
  AutonomyLevel,
  BlockerType,
  Channel,
  ComplianceGateStatus,
  ConsentState,
  ControlState,
  ConversationOutcome,
  ConversationStatus,
  EmployeeStatus,
  FactSource,
  FallbackBehaviour,
  GroundingState,
  IntegrationStatus,
  Intervention,
  IssueCause,
  IssueSeverity,
  IssueStatus,
  KnowledgeItem,
  KnowledgeSource,
  KnowledgeSourceKind,
  PhoneNumber,
  ProcedureRunStep,
  ProcedureStepKind,
  ProposedFixKind,
  Release,
  Scenario,
  ScenarioResultStatus,
  ToolEffect,
  ToolStatus,
  UsageSnapshot,
} from "./types";
import type { Tone } from "@/components/primitives/status";
// A derived state rather than a stored one, so it lives with the derivation
// instead of in the object model — but its copy still belongs in this file,
// which is the one place a reader looks for "what does the UI call this?".
import type { StepBlockerKind } from "./procedures";
import type { PaceVerdict } from "./usage";

type ReleaseState = Release["state"];

export const CONTROL_LABEL: Record<ControlState, string> = {
  ai: "AI handling",
  human: "You have control",
  transferring: "Transferring to a person",
  ended: "Ended",
};

export const CONTROL_TONE: Record<ControlState, Tone> = {
  ai: "ai",
  human: "human",
  transferring: "warning",
  ended: "neutral",
};

export const ACTIVITY_LABEL: Record<AIActivity, string> = {
  listening: "Listening",
  thinking: "Working",
  speaking: "Speaking",
  idle: "Waiting",
};

export const STATUS_LABEL: Record<ConversationStatus, string> = {
  ringing: "Ringing",
  active: "In progress",
  waiting: "Caller waiting",
  wrapping: "Wrapping up",
  ended: "Ended",
};

export const OUTCOME_LABEL: Record<ConversationOutcome, string> = {
  resolved: "Resolved",
  escalated: "Escalated",
  abandoned: "Abandoned",
  failed: "Failed",
  in_progress: "In progress",
};

export const OUTCOME_TONE: Record<ConversationOutcome, Tone> = {
  resolved: "success",
  escalated: "human",
  abandoned: "warning",
  failed: "danger",
  in_progress: "ai",
};

/**
 * Grounding replaces a confidence percentage. Each label says where the answer
 * came from, which is something a practice manager can actually act on.
 */
export const GROUNDING_LABEL: Record<GroundingState, string> = {
  grounded: "From an approved source",
  policy: "Followed a rule",
  inferred: "Pieced together from the conversation",
  unsupported: "No approved source — declined",
};

export const GROUNDING_SHORT: Record<GroundingState, string> = {
  grounded: "Sourced",
  policy: "Rule",
  inferred: "Inferred",
  unsupported: "No source",
};

export const GROUNDING_TONE: Record<GroundingState, Tone> = {
  grounded: "success",
  policy: "info",
  inferred: "warning",
  unsupported: "danger",
};

/** Every escalation names one of these, and each maps to a specific fix. */
export const BLOCKER_LABEL: Record<BlockerType, string> = {
  identity_unverified: "Could not verify who was calling",
  ambiguous_intent: "Could not tell what was being asked",
  conflicting_sources: "Approved sources disagreed",
  tool_failed: "A connected system did not respond",
  out_of_scope: "Outside what this AI employee handles",
  policy_requires_human: "A rule requires a person",
  customer_requested_human: "The caller asked for a person",
  emotional_distress: "The caller was distressed",
};

export const BLOCKER_SHORT: Record<BlockerType, string> = {
  identity_unverified: "Identity unverified",
  ambiguous_intent: "Unclear request",
  conflicting_sources: "Conflicting sources",
  tool_failed: "System unavailable",
  out_of_scope: "Out of scope",
  policy_requires_human: "Rule requires a person",
  customer_requested_human: "Caller asked for a person",
  emotional_distress: "Caller distressed",
};

export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  pending_approval: "Waiting for approval",
  running: "In progress",
  completed: "Done",
  failed: "Failed",
  rejected: "Declined",
  skipped: "Skipped",
};

export const ACTION_STATUS_TONE: Record<ActionStatus, Tone> = {
  pending_approval: "warning",
  running: "ai",
  completed: "success",
  failed: "danger",
  rejected: "neutral",
  skipped: "neutral",
};

/** What a person did mid-call, named as the action rather than the log event. */
export const INTERVENTION_LABEL: Record<Intervention["kind"], string> = {
  monitor: "Started monitoring the call",
  coach: "Sent the AI a coaching note",
  takeover: "Took over the call",
  transfer: "Transferred the call to a person",
  return_to_ai: "Handed the call back to the AI",
};

export const PROCEDURE_STEP_LABEL: Record<ProcedureRunStep["status"], string> = {
  pending: "Not started",
  active: "In progress",
  complete: "Done",
  skipped: "Skipped",
  failed: "Failed",
};

export const PROCEDURE_STEP_TONE: Record<ProcedureRunStep["status"], Tone> = {
  pending: "neutral",
  active: "ai",
  complete: "success",
  skipped: "neutral",
  failed: "danger",
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  voice: "Phone",
  sms: "SMS",
  whatsapp: "WhatsApp",
  webchat: "Web chat",
  email: "Email",
};

/**
 * What happens to a caller when the AI is not the one answering — out of
 * hours, paused, or over budget. Phrased as instructions because this is the
 * one enum a person picks from rather than only reads.
 */
export const FALLBACK_KIND_LABEL: Record<FallbackBehaviour["kind"], string> = {
  voicemail: "Take a voicemail",
  forward: "Forward to a person",
  announce: "Play a recorded message",
};

/**
 * "Not assigned" rather than "Unassigned": a number nobody has pointed at an
 * AI employee rings out, which is a thing someone needs to finish, not a
 * neutral configuration state.
 */
export const NUMBER_STATUS_LABEL: Record<PhoneNumber["status"], string> = {
  active: "Active",
  provisioning: "Being connected",
  unassigned: "Not assigned",
};

export const NUMBER_STATUS_TONE: Record<PhoneNumber["status"], Tone> = {
  active: "success",
  provisioning: "info",
  unassigned: "warning",
};

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  live: "Live",
  paused: "Paused",
  draft: "Draft",
  scheduled: "Scheduled",
  degraded: "Degraded",
};

/**
 * `ai` is absent for the same reason it is absent from the issue tones: this
 * says whether an AI employee is published and healthy, which is not the same
 * fact as an AI holding a live call, and the reserved hue answers only the
 * second.
 */
export const EMPLOYEE_STATUS_TONE: Record<EmployeeStatus, Tone> = {
  live: "success",
  paused: "warning",
  draft: "neutral",
  scheduled: "info",
  degraded: "danger",
};

/**
 * Autonomy. Phrased from the business owner's point of view — what the AI will
 * do — rather than as a permission constant.
 */
export const AUTONOMY_LABEL: Record<AutonomyLevel, string> = {
  observe: "Never does this",
  suggest: "Drafts it for a person",
  approve: "Asks a person first",
  act: "Does it",
  act_notify: "Does it and tells someone",
};

export const AUTONOMY_TONE: Record<AutonomyLevel, Tone> = {
  observe: "neutral",
  suggest: "info",
  approve: "warning",
  act: "success",
  act_notify: "success",
};

export const CAUSE_LABEL: Record<IssueCause, string> = {
  missing_knowledge: "Missing answer",
  conflicting_knowledge: "Sources disagree",
  stale_knowledge: "Out of date",
  procedure_gap: "Procedure gap",
  procedure_error: "Procedure error",
  tool_failure: "Connected system failing",
  policy_ambiguity: "Rule unclear",
  transcription_failure: "Speech not understood",
  unclear_scope: "Scope unclear",
  autonomy_too_low: "Approval no longer needed",
  autonomy_too_high: "Needs closer control",
};

export const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const SEVERITY_TONE: Record<IssueSeverity, Tone> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
};

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  open: "Open",
  in_progress: "Being fixed",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

/**
 * Neither `ai` nor `human` appears here. Those hues answer "who is driving this
 * conversation" and nothing else may borrow them — a review item being worked
 * on by a person is not the same fact as a person holding a live call.
 */
export const ISSUE_STATUS_TONE: Record<IssueStatus, Tone> = {
  open: "warning",
  in_progress: "info",
  resolved: "success",
  dismissed: "neutral",
};

/**
 * What a proposed fix would actually change, said as the change rather than as
 * its internal kind. Deliberately free of domain nouns: "step" rather than
 * "procedure step", because procedure is a lexicon term and these labels are
 * not — they read the same in a clinic and a law firm.
 */
export const FIX_KIND_LABEL: Record<ProposedFixKind, string> = {
  add_knowledge: "Add an answer",
  edit_knowledge: "Correct an answer",
  resolve_conflict: "Choose the authoritative source",
  edit_procedure: "Change a step",
  adjust_autonomy: "Change an authority level",
  reconnect_tool: "Reconnect a system",
};

/**
 * Compliance gate state.
 *
 * A gate is not a setting, so these are not on/off words. "Needs action" names
 * work someone has to do; "Not applicable" is a decision that was reached about
 * this workspace, not a feature left switched off — and it says so on the
 * screen, because a governance surface that hides irrelevant obligations gives
 * no way to check whether they were considered at all.
 */
export const GATE_STATUS_LABEL: Record<ComplianceGateStatus, string> = {
  met: "Met",
  action_needed: "Needs action",
  not_applicable: "Not applicable",
};

/**
 * `warning` rather than `danger` for a gate that needs action: danger is
 * reserved for something failing right now, and an unmet gate is work
 * outstanding on a line that is still answering correctly. The screen escalates
 * the *consequence* — publishing is blocked — in words instead.
 */
export const GATE_STATUS_TONE: Record<ComplianceGateStatus, Tone> = {
  met: "success",
  action_needed: "warning",
  not_applicable: "neutral",
};

/**
 * Release state.
 *
 * "Live" is deliberately absent. A release is published or it is not; whether
 * it is the one currently answering the phone is a fact about the whole set —
 * the highest published version that has not since been undone — and it is
 * derived in `domain/releases.ts` rather than stored. Putting Live in this map
 * would give two releases the same badge the moment a second one publishes.
 */
export const RELEASE_STATE_LABEL: Record<ReleaseState, string> = {
  draft: "Not published",
  published: "Published",
  rolled_back: "Rolled back",
};

export const RELEASE_STATE_TONE: Record<ReleaseState, Tone> = {
  draft: "info",
  published: "success",
  rolled_back: "warning",
};

/** What a simulated scenario did. Not a score — see arch §3.2. */
export const SCENARIO_RESULT_LABEL: Record<ScenarioResultStatus, string> = {
  passed: "Passed",
  failed: "Failed",
  warning: "Needs a decision",
  skipped: "Not run",
};

export const SCENARIO_RESULT_TONE: Record<ScenarioResultStatus, Tone> = {
  passed: "success",
  failed: "danger",
  warning: "warning",
  skipped: "neutral",
};

/**
 * How hard a scenario is, described by the call rather than by the grading.
 * "Adversarial" is the model's word and a test engineer's word; the person
 * deciding whether to publish is a practice manager, and what they need to
 * know is that this is the call they would dread taking themselves.
 */
export const DIFFICULTY_LABEL: Record<Scenario["difficulty"], string> = {
  routine: "Everyday",
  awkward: "Awkward",
  adversarial: "Worst case",
};

/**
 * Where a scenario came from. This distinction earns its place on screen
 * because of arch §12's simulation–reality gap: a suite built only from
 * imagined calls proves much less than one seeded from calls that actually
 * went wrong, and the interface should not let those look the same.
 */
export const SCENARIO_ORIGIN_LABEL: Record<Scenario["origin"], string> = {
  seeded_from_failure: "From a real failure",
  authored: "Written by hand",
  generated: "Generated",
};

// ─────────────────────────────────────────────────────────────────────────────
// Knowledge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where a source came from, phrased as its provenance rather than its file
 * type. "Written here" matters to the person deciding which of two sources
 * wins a contradiction; "faq" does not.
 */
export const SOURCE_KIND_LABEL: Record<KnowledgeSourceKind, string> = {
  website: "Website",
  document: "Uploaded document",
  faq: "Written here",
  manual: "Written here",
  recording: "Learned from calls",
  integration: "Connected system",
};

/**
 * Source state, said as what it means for a caller on the phone right now.
 * "Ready" is the stored value; "In use" is the fact — this source is answering
 * questions this minute, which is what makes a failing one urgent.
 */
export const SOURCE_STATUS_LABEL: Record<KnowledgeSource["status"], string> = {
  syncing: "Reading it now",
  ready: "In use",
  error: "Not syncing",
  stale: "Not checked lately",
};

export const SOURCE_STATUS_TONE: Record<KnowledgeSource["status"], Tone> = {
  syncing: "info",
  ready: "success",
  error: "danger",
  stale: "warning",
};

/**
 * An answer's own state. A draft is not a lesser answer — it is an answer the
 * AI is not allowed to say yet, and the distinction is the whole point of
 * having drafts at all.
 */
export const ANSWER_STATUS_LABEL: Record<KnowledgeItem["status"], string> = {
  approved: "Approved",
  draft: "Draft — not in use",
  stale: "Out of date",
};

export const ANSWER_STATUS_TONE: Record<KnowledgeItem["status"], Tone> = {
  approved: "success",
  draft: "info",
  stale: "warning",
};

/**
 * Consent. "Not asked" rather than "Unknown": the gap is a thing someone can
 * close, and naming it as missing information invites that.
 */
export const CONSENT_LABEL: Record<ConsentState, string> = {
  granted: "Granted",
  declined: "Declined",
  unknown: "Not asked",
};

export const CONSENT_TONE: Record<ConsentState, Tone> = {
  granted: "success",
  declined: "neutral",
  unknown: "warning",
};

/** Provenance of a fact on a customer record. */
export const FACT_SOURCE_LABEL: Record<FactSource, string> = {
  verified: "Verified",
  imported: "Imported",
  ai_inferred: "Noted by AI",
  unverified: "Unverified",
};

export const FACT_SOURCE_TONE: Record<FactSource, Tone> = {
  verified: "success",
  imported: "neutral",
  ai_inferred: "ai",
  unverified: "warning",
};

// ─────────────────────────────────────────────────────────────────────────────
// Records
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record status and type are strings, not unions, because the set is
 * schema-driven: a workspace's record types bring their own lifecycle, and the
 * six archetypes do not share one. So these maps cover what the archetypes have
 * in common and `humanize` catches the rest — a token nobody mapped still
 * reaches the screen as "Awaiting deposit" rather than "awaiting_deposit".
 *
 * These are not lexicon entries. "Cancelled" means cancelled in every industry;
 * the noun it applies to is what changes, and that comes from `useLexicon()`.
 */

/** snake_case or camelCase → "Sentence case". */
export function humanize(token: string): string {
  const words = token
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const RECORD_STATUS_LABEL: Record<string, string> = {
  // Visits
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  pending_confirmation: "Awaiting confirmation",
  rescheduled: "Being moved",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "Did not attend",
  // Cases
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
  // Leads
  new: "New",
  contacted: "Contacted",
  converted: "Converted",
  lost: "Lost",
  // Orders
  issued: "Issued",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

const RECORD_STATUS_TONE: Record<string, Tone> = {
  scheduled: "info",
  confirmed: "success",
  pending_confirmation: "warning",
  rescheduled: "info",
  completed: "neutral",
  cancelled: "neutral",
  no_show: "warning",
  open: "warning",
  in_progress: "info",
  resolved: "success",
  closed: "neutral",
  new: "info",
  contacted: "info",
  converted: "success",
  lost: "neutral",
  issued: "info",
  paid: "success",
  overdue: "danger",
  void: "neutral",
};

export function recordStatusLabel(status: string): string {
  return RECORD_STATUS_LABEL[status] ?? humanize(status);
}

/** Unmapped statuses stay neutral: inventing a colour would invent a meaning. */
export function recordStatusTone(status: string): Tone {
  return RECORD_STATUS_TONE[status] ?? "neutral";
}

/**
 * The record type within an archetype. Healthcare's set is spelled out because
 * Northgate is the fixture tenant; every other workspace falls through to
 * `humanize` until record types are configured per pack and the label arrives
 * from the API with the record.
 */
const RECORD_TYPE_LABEL: Record<string, string> = {
  gp_appointment: "GP appointment",
  dental_checkup: "Dental check-up",
  physio_session: "Physiotherapy",
  telephone_consultation: "Telephone consultation",
  nurse_appointment: "Nurse appointment",
  blood_test: "Blood test",
  vaccination: "Vaccination",
  callback: "Callback",
  referral: "Referral",
  complaint: "Complaint",
  registration: "Registration",
  enquiry: "Enquiry",
  invoice: "Invoice",
};

export function recordTypeLabel(typeId: string): string {
  return RECORD_TYPE_LABEL[typeId] ?? humanize(typeId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tools and integrations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Connection health, said as what it means rather than as a transport state.
 *
 * "Failing intermittently" rather than "degraded" because that is the state
 * worth acting on: a connection that works four times in five produces a
 * mystery — callers who were offered times and callers who were not, on the
 * same morning — where one that is plainly down at least explains itself.
 */
export const INTEGRATION_STATUS_LABEL: Record<IntegrationStatus, string> = {
  connected: "Working",
  degraded: "Failing intermittently",
  disconnected: "Not connected",
  error: "Not working",
};

export const INTEGRATION_STATUS_TONE: Record<IntegrationStatus, Tone> = {
  connected: "success",
  degraded: "warning",
  disconnected: "neutral",
  error: "danger",
};

/**
 * An action's state, phrased from the AI's side. The question this surface
 * answers is not "is the API up" but "can the AI do this on a call right now",
 * and those two have different answers whenever an action is the only one of a
 * connection's actions that is broken.
 */
export const TOOL_STATUS_LABEL: Record<ToolStatus, string> = {
  available: "The AI can use this",
  degraded: "Works sometimes",
  unavailable: "The AI cannot use this",
};

/** The same three states where a row has no room for the sentence. */
export const TOOL_STATUS_SHORT: Record<ToolStatus, string> = {
  available: "Working",
  degraded: "Unreliable",
  unavailable: "Unavailable",
};

export const TOOL_STATUS_TONE: Record<ToolStatus, Tone> = {
  available: "success",
  degraded: "warning",
  unavailable: "danger",
};

/**
 * What calling an action does on the other side.
 *
 * Not a technical footnote: reading is recoverable and writing is not, which is
 * why one deserves an approval step and the other rarely does. Naming it in
 * plain words puts that distinction in front of whoever grants the action.
 */
export const TOOL_EFFECT_LABEL: Record<ToolEffect, string> = {
  reads: "Looks something up",
  writes: "Changes something",
};

// ─────────────────────────────────────────────────────────────────────────────
// Procedures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a step does, named as the act rather than as a node type.
 *
 * These belong here rather than in the lexicon because asking is asking in
 * every industry — the *noun* a step asks about lives in its instruction, which
 * is authored per workspace and never resolved through a table.
 */
export const STEP_KIND_LABEL: Record<ProcedureStepKind, string> = {
  ask: "Asks",
  look_up: "Looks up",
  decide: "Decides",
  act: "Does",
  say: "Says",
  hand_off: "Hands over",
};

/**
 * Why a step cannot be relied on.
 *
 * Each is written as the consequence for a caller rather than as the internal
 * fault, and each is specific enough to imply its own fix — which is the same
 * standard the blocker labels above are held to, for the same reason.
 */
export const STEP_BLOCKER_LABEL: Record<StepBlockerKind, string> = {
  tool_missing: "Needs an action that no longer exists",
  tool_unavailable: "The action it needs is not working",
  tool_unreliable: "The action it needs fails some of the time",
  tool_not_granted: "The action it needs has not been granted",
  not_authorised: "Not authorised to do this",
};

export const STEP_BLOCKER_TONE: Record<StepBlockerKind, Tone> = {
  tool_missing: "danger",
  tool_unavailable: "danger",
  tool_unreliable: "warning",
  tool_not_granted: "warning",
  not_authorised: "warning",
};

// ─────────────────────────────────────────────────────────────────────────────
// Usage and billing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What happens to a caller once spend reaches the budget. A person picks from
 * this set (§3.12), so each is phrased as the consequence for a caller rather
 * than as an internal mode.
 */
export const CAP_BEHAVIOUR_LABEL: Record<UsageSnapshot["atCap"], string> = {
  notify: "Notify and keep going",
  voicemail: "Send calls to voicemail",
  stop: "Stop answering",
};

export const CAP_BEHAVIOUR_DETAIL: Record<UsageSnapshot["atCap"], string> = {
  notify:
    "Everyone with billing access is notified. Calls keep being answered as normal — the budget becomes a number to watch rather than a limit that bites.",
  voicemail:
    "New calls go to voicemail instead of being answered by the AI, until the next billing period starts or the budget is raised.",
  stop: "The AI stops answering. Callers reach whatever fallback path is set for each number, the same as an unplanned outage.",
};

export const PACE_VERDICT_LABEL: Record<PaceVerdict, string> = {
  no_budget: "No budget set",
  under_pace: "Under pace",
  on_pace: "On pace",
  over_pace: "Over pace",
};

/**
 * `danger` is deliberately absent — being over pace midway through the month
 * is a trend to watch, not a failure happening right now. That reservation is
 * for the moment spend actually reaches the cap.
 */
export const PACE_VERDICT_TONE: Record<PaceVerdict, Tone> = {
  no_budget: "neutral",
  under_pace: "success",
  on_pace: "info",
  over_pace: "warning",
};
