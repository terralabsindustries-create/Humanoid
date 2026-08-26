import { http } from "./client";

/** Shapes returned by the backend's parties module, one-to-one with the API. */
export type ApiPartyFact = {
  label: string;
  value: string;
  /** verified | imported | ai_inferred | unverified */
  source: string;
  updatedAt: string;
};

export type ApiParty = {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  preferredLanguage: string | null;
  status: string;
  facts: ApiPartyFact[];
  createdAt: string;
  lastContactAt: string | null;
};

export type ApiPartyQuery = {
  search?: string;
  unconfirmedOnly?: boolean;
  limit?: number;
};

export function listParties(workspaceId: string, query: ApiPartyQuery = {}) {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.unconfirmedOnly) params.set("unconfirmedOnly", "true");
  if (query.limit) params.set("limit", String(query.limit));
  const suffix = params.size > 0 ? `?${params}` : "";
  return http.get<ApiParty[]>(`/workspaces/${workspaceId}/parties${suffix}`);
}

export function getParty(workspaceId: string, partyId: string) {
  return http.get<ApiParty>(`/workspaces/${workspaceId}/parties/${partyId}`);
}

/**
 * Confirming and correcting both return the whole updated record, so the
 * screen re-renders from what the server actually stored rather than from an
 * optimistic guess about it.
 *
 * The fact's label travels in the body, not the path: labels are human
 * sentences with spaces in them, and a path segment is the wrong container
 * for a value like that.
 */
export function confirmPartyFact(workspaceId: string, partyId: string, label: string) {
  return http.post<ApiParty>(`/workspaces/${workspaceId}/parties/${partyId}/facts/confirm`, {
    label,
  });
}

export function correctPartyFact(
  workspaceId: string,
  partyId: string,
  label: string,
  value: string,
) {
  return http.patch<ApiParty>(`/workspaces/${workspaceId}/parties/${partyId}/facts`, {
    label,
    value,
  });
}
