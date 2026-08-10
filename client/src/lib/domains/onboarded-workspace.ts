import type { Location, RolePreset, User, Workspace } from "@/lib/domain/types";
import type { IndustryPackId } from "@/lib/lexicon";
import { getMe } from "@/lib/services/http/workspaces";
import { HttpError } from "@/lib/services/http/client";

function slugToCode(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase() || "HQ"
  );
}

type Resolved = { workspace: Workspace; location: Location; user: User } | null;

// The mock service calls this once per identity-bearing endpoint
// (getWorkspace, listLocations, getCurrentUser, listUsers, …), and those all
// fire together on app load — without de-duping, one page load would fire a
// burst of identical `/me` requests. Concurrent callers share one in-flight
// fetch; a short cache absorbs the rest of that burst.
let inFlight: Promise<Resolved> | null = null;
let cached: { value: Resolved; expiresAt: number } | null = null;
const CACHE_MS = 5_000;

/**
 * Bridges the real backend to the mock service layer.
 *
 * Northgate Health (`lib/mock/fixtures.ts`) is the fixture for a mature,
 * already-onboarded tenant and is left untouched — it never touches the
 * network. A signed-in visitor who has completed onboarding is a *different*
 * tenant, and a real one: this fetches their actual workspace from the
 * backend (`GET /me`) so the shell (sidebar identity, scope selector,
 * lexicon-driven nav, capability-gated navigation) reflects the business
 * they actually configured — not a synthesized guess.
 *
 * Returns null for an anonymous visitor, a signed-in visitor with no
 * workspace yet, or a workspace whose onboarding never reached an industry —
 * every one of those cases correctly falls back to Northgate in
 * `services/mock.ts`.
 */
export async function resolveOnboardedWorkspace(): Promise<Resolved> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (inFlight) return inFlight;

  inFlight = resolveUncached().finally(() => {
    inFlight = null;
  });
  const value = await inFlight;
  cached = { value, expiresAt: Date.now() + CACHE_MS };
  return value;
}

async function resolveUncached(): Promise<Resolved> {
  let me;
  try {
    me = await getMe();
  } catch (error) {
    if (error instanceof HttpError && (error.status === 401 || error.status === 404)) return null;
    throw error;
  }

  const membership = me.workspaces[0];
  if (!membership || !membership.workspace.industryKey) return null;

  const apiWorkspace = membership.workspace;
  const industry = apiWorkspace.industryKey as IndustryPackId;

  const workspace: Workspace = {
    id: apiWorkspace.id,
    name: apiWorkspace.name,
    industry,
    lexiconOverrides: {},
    regulatoryProfile: industry === "healthcare" || industry === "dental" ? "healthcare" : "standard",
    timezone: apiWorkspace.timezone,
    currency: "GBP",
  };

  const location: Location = {
    id: `${apiWorkspace.id}_main`,
    workspaceId: apiWorkspace.id,
    name: apiWorkspace.name,
    code: slugToCode(apiWorkspace.name),
    timezone: apiWorkspace.timezone,
    address: "Main location",
    departmentIds: [],
  };

  const user: User = {
    id: me.user.id,
    name: me.user.name,
    email: me.user.email,
    role: membership.role as RolePreset,
    capabilities: membership.capabilities,
    locationIds: [location.id],
    onCall: false,
  };

  return { workspace, location, user };
}
