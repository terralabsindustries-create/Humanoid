import { authService } from "@/lib/services/auth";
import { getMe } from "@/lib/services/http/workspaces";
import { getOnboarding } from "@/lib/services/http/onboarding";
import { useAuth } from "@/lib/store/auth";
import { useOnboarding, type OrganizationInfo } from "@/lib/store/onboarding";
import type { IndustryPackId } from "@/lib/lexicon";
import { resumeHref } from "./routing";

/**
 * The single source of truth for "where does this visitor actually belong,"
 * called at every real entry point (root `/`, the auth-guard layout, right
 * after login/verify). Backend-authoritative rather than trusting whatever
 * localStorage happens to hold — a fresh browser, a different device, or a
 * stale cache all resolve correctly because this asks the server, then
 * overwrites the local onboarding cache with what it hears back.
 *
 * Deliberately not called from every onboarding step's own page guard —
 * once a visitor has been routed in via one of the entry points above, the
 * local store is kept in sync by that step's own checkpoint actions, and
 * re-fetching on every route change inside the wizard would just be
 * chattiness with no payoff.
 */
export async function bootstrapSession(): Promise<{ authenticated: boolean; destination: string }> {
  const session = await authService.getSession();
  if (!session) {
    return { authenticated: false, destination: "/login" };
  }

  useAuth.getState().signIn(session.email, session.name);

  const me = await getMe();
  const membership = me.workspaces[0];

  if (!membership) {
    useOnboarding.getState().reset();
    return { authenticated: true, destination: "/onboarding/organization" };
  }

  const { workspace } = membership;
  const { session: onboardingSession, answers } = await getOnboarding(workspace.id);

  const snapshot = {
    workspaceId: workspace.id,
    organization: onboardingSession.organizationJson as OrganizationInfo,
    industry: onboardingSession.industryKey as IndustryPackId | null,
    answers,
    completedSectionIds: onboardingSession.completedSections,
    completed: onboardingSession.status === "completed",
  };

  useOnboarding.getState().hydrateFromServer(snapshot);

  const destination = snapshot.completed ? "/today" : resumeHref(snapshot);
  return { authenticated: true, destination };
}
