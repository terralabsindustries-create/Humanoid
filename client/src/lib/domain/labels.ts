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
  ControlState,
  ConversationOutcome,
  ConversationStatus,
  FactSource,
  GroundingState,
  IssueCause,
  IssueSeverity,
} from "./types";
import type { Tone } from "@/components/primitives/status";

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

export const CHANNEL_LABEL: Record<Channel, string> = {
  voice: "Phone",
  sms: "SMS",
  whatsapp: "WhatsApp",
  webchat: "Web chat",
  email: "Email",
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
