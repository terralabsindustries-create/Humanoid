import { http } from "./client";

/** Shapes returned by the backend's records module, one-to-one with the API. */
export type ApiRecord = {
  id: string;
  /** The directory record for whoever it is for. Null for a withheld number. */
  partyId: string | null;
  archetype: string;
  typeId: string;
  status: string;
  partyName: string | null;
  partyPhone: string | null;
  scheduledAt: string | null;
  fields: Record<string, unknown>;
  createdByConversationId: string | null;
  createdAt: string;
};

export function listRecords(
  workspaceId: string,
  options: { limit?: number; partyId?: string } = {},
) {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  // Same reasoning as conversations: everything raised for one person, not
  // whatever survives a page of the whole workspace's diary.
  if (options.partyId) params.set("partyId", options.partyId);
  const query = params.size > 0 ? `?${params}` : "";
  return http.get<ApiRecord[]>(`/workspaces/${workspaceId}/records${query}`);
}
