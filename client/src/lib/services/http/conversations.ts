import { http } from "./client";

export type ApiCallSession = {
  id: string;
  conversationId: string;
  provider: string;
  providerCallId: string;
  fromNumber: string;
  toNumber: string;
  status: string;
  connectedAt: string | null;
  endedAt: string | null;
  latencyMetricsJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ApiConversationMessage = {
  id: string;
  conversationId: string;
  sequenceNumber: number;
  /** customer | ai */
  speakerType: string;
  contentType: string;
  textContent: string | null;
  confidence: number | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
};

export type ApiConversation = {
  id: string;
  workspaceId: string;
  aiEmployeeId: string | null;
  /** The directory record for whoever rang. Null for a withheld number. */
  partyId: string | null;
  channelType: string;
  direction: string;
  /** active | completed | failed */
  status: string;
  startedAt: string;
  endedAt: string | null;
  language: string;
  /** completed | no_speech | turn_limit | error, set once the call ends */
  outcomeCode: string | null;
  summary: string | null;
  metadataJson: Record<string, unknown>;
  callSession: ApiCallSession | null;
  aiEmployee: { id: string; name: string; roleName: string } | null;
  _count?: { messages: number };
  /** Only present on the single-conversation fetch. */
  messages?: ApiConversationMessage[];
};

export type ApiConversationStats = {
  callsToday: number;
  callsTotal: number;
  avgDurationSeconds: number | null;
  avgTurnsPerCall: number | null;
  completedCalls: number;
  failedCalls: number;
  activeCalls: number;
};

export function listConversations(
  workspaceId: string,
  options: { limit?: number; partyId?: string } = {},
) {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  // Filtered server-side: one person's history has to reach past whatever the
  // most recent page of calls happens to contain.
  if (options.partyId) params.set("partyId", options.partyId);
  const query = params.size > 0 ? `?${params}` : "";
  return http.get<ApiConversation[]>(`/workspaces/${workspaceId}/conversations${query}`);
}

export function getConversation(workspaceId: string, conversationId: string) {
  return http.get<ApiConversation>(`/workspaces/${workspaceId}/conversations/${conversationId}`);
}

export function getConversationStats(workspaceId: string) {
  return http.get<ApiConversationStats>(`/workspaces/${workspaceId}/conversations-stats`);
}
