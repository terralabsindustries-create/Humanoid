import type { Conversation, ConversationOutcome, ConversationStatus, Turn } from "@/lib/domain/types";
import type { ConversationFilters } from "@/lib/services/contract";
import * as api from "@/lib/services/http/conversations";
import { HttpError } from "@/lib/services/http/client";

/**
 * Bridges the real conversations backend (`backend/src/modules/conversations`)
 * to the rich `Conversation` shape the frontend renders.
 *
 * The backend only knows what the voice pipeline actually captured: a
 * transcript, when the call started and ended, and why it ended. Everything
 * this product can show but the backend cannot yet produce — a live control
 * handoff, grounding citations, actions taken, a procedure run, human
 * interventions, sentiment — is left at its honest empty value rather than
 * invented. See rule 13 in the root CLAUDE.md.
 */

const LIVE_STATUSES: ConversationStatus[] = ["ringing", "active", "waiting", "wrapping"];

function mapStatus(status: string): ConversationStatus {
  return status === "active" ? "active" : "ended";
}

function mapOutcome(status: string, outcomeCode: string | null): ConversationOutcome {
  if (status === "active") return "in_progress";
  if (status === "failed") return "failed";
  return outcomeCode === "no_speech" ? "abandoned" : "resolved";
}

function mapMessage(message: api.ApiConversationMessage): Turn {
  return {
    id: message.id,
    at: message.createdAt,
    speaker: message.speakerType === "customer" ? "customer" : "ai",
    text: message.textContent ?? "",
  };
}

function durationSeconds(startedAt: string, endedAt: string | null): number {
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  return Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 1000));
}

function mapConversation(c: api.ApiConversation, locationId: string): Conversation {
  const status = mapStatus(c.status);

  return {
    id: c.id,
    workspaceId: c.workspaceId,
    locationId,
    employeeId: c.aiEmployeeId ?? "",
    channel: "voice",
    direction: c.direction === "outbound" ? "outbound" : "inbound",
    status,
    control: status === "active" ? "ai" : "ended",
    activity: "idle",
    startedAt: c.startedAt,
    endedAt: c.endedAt,
    partyId: null,
    fromLabel: c.callSession?.fromNumber ?? "Unknown caller",
    intent: c.summary,
    outcome: mapOutcome(c.status, c.outcomeCode),
    blocker: null,
    escalatedToUserId: null,
    summary: c.summary,
    turns: (c.messages ?? []).map(mapMessage),
    actions: [],
    procedureRun: null,
    interventions: [],
    recordingAvailable: false,
    recordingConsent: "not_required",
    effort: {
      clarificationTurns: 0,
      repeats: 0,
      durationSeconds: durationSeconds(c.startedAt, c.endedAt),
    },
    sentiment: null,
    followUpTaskIds: [],
  };
}

export async function listRealConversations(
  workspaceId: string,
  locationId: string,
  filters: ConversationFilters,
): Promise<Conversation[]> {
  const raw = await api.listConversations(workspaceId, filters.limit);
  let list = raw.map((c) => mapConversation(c, locationId));

  if (filters.live) list = list.filter((c) => LIVE_STATUSES.includes(c.status));
  if (filters.employeeId) list = list.filter((c) => c.employeeId === filters.employeeId);
  // Real conversations have no verified party yet (rule 13) — any partyId
  // filter honestly matches nothing rather than guessing at an identity.
  if (filters.partyId) list = list.filter((c) => c.partyId === filters.partyId);
  if (filters.outcome?.length) list = list.filter((c) => filters.outcome!.includes(c.outcome));
  if (filters.channel?.length) list = list.filter((c) => filters.channel!.includes(c.channel));
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(
      (c) => c.fromLabel.toLowerCase().includes(q) || c.summary?.toLowerCase().includes(q),
    );
  }

  return list;
}

export async function getRealConversation(
  workspaceId: string,
  locationId: string,
  conversationId: string,
): Promise<Conversation | null> {
  try {
    const raw = await api.getConversation(workspaceId, conversationId);
    return mapConversation(raw, locationId);
  } catch (error) {
    if (error instanceof HttpError && (error.status === 404 || error.status === 403)) return null;
    throw error;
  }
}
