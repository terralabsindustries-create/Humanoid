"use client";

import { useEffect, useState, createContext, useContext } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { MotionConfig } from "motion/react";
import { qk, service } from "@/lib/services";
import { TactileLayer } from "@/components/providers/tactile-layer";
import { usePreferences } from "@/lib/store/preferences";
import { useScope } from "@/lib/store/scope";
import { resolveLexicon, type Lexicon } from "@/lib/lexicon";
import { BASE_LEXICON } from "@/lib/lexicon";
import { getDomainPack, type DomainPack } from "@/lib/domains/registry";
import type { Location, User, Workspace } from "@/lib/domain/types";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Operational data goes stale fast. Live surfaces override this with
        // their own refetch interval.
        staleTime: 15_000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
  });
}

type WorkspaceContextValue = {
  workspace: Workspace | undefined;
  locations: Location[];
  user: User | undefined;
  lexicon: Lexicon;
  /** Layer 3 config for this workspace's industry. Null with no pack selected. */
  domainPack: DomainPack | null;
  loading: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspace: undefined,
  locations: [],
  user: undefined,
  lexicon: BASE_LEXICON,
  domainPack: null,
  loading: true,
});

/** The lexicon hook every component uses instead of writing domain nouns. */
export function useLexicon(): Lexicon {
  return useContext(WorkspaceContext).lexicon;
}

/** This workspace's domain pack, or null when no industry is set. */
export function useDomainPack(): DomainPack | null {
  return useContext(WorkspaceContext).domainPack;
}

export function useWorkspace(): WorkspaceContextValue {
  return useContext(WorkspaceContext);
}

/**
 * Scoped to the authenticated shell (`(app)/layout.tsx`), not mounted
 * globally in `AppProviders`. Fetching workspace/user/location data before a
 * visitor is even signed in — or mid-onboarding, before a workspace exists
 * to describe — has nothing to fetch for and nothing to show it to; worse,
 * an early fetch caches a result that then sits fresh for `staleTime`,
 * which is exactly how a workspace created moments later during onboarding
 * could still read as the previous cached value once the shell mounts.
 */
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const workspaceQuery = useQuery({
    queryKey: qk.workspace,
    queryFn: () => service.getWorkspace(),
  });
  const locationsQuery = useQuery({
    queryKey: qk.locations,
    queryFn: () => service.listLocations(),
  });
  const userQuery = useQuery({
    queryKey: qk.me,
    queryFn: () => service.getCurrentUser(),
  });

  const workspace = workspaceQuery.data;
  const lexicon = workspace
    ? resolveLexicon(workspace.industry, workspace.lexiconOverrides)
    : BASE_LEXICON;
  const domainPack = workspace?.industry ? getDomainPack(workspace.industry) : null;

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        locations: locationsQuery.data ?? [],
        user: userQuery.data,
        lexicon,
        domainPack,
        loading: workspaceQuery.isLoading || userQuery.isLoading,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

/**
 * Reconciles stored preferences and scope after mount. Both stores start from
 * defaults on server and first client render, so this cannot mismatch.
 */
function StoreHydration() {
  const hydratePreferences = usePreferences((s) => s.hydrate);
  const hydrateScope = useScope((s) => s.hydrate);
  const theme = usePreferences((s) => s.theme);

  useEffect(() => {
    hydratePreferences();
    hydrateScope();
  }, [hydratePreferences, hydrateScope]);

  // Follow the OS when the user has chosen "system".
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      document.documentElement.dataset.theme = media.matches
        ? "dark"
        : "light";
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  // Reduced sensory mode forces every Motion-driven animation off, the same
  // way it silences sound — see globals.css for the parallel CSS-side rule
  // covering plain transitions and keyframes, which MotionConfig cannot reach.
  const reducedSensory = usePreferences((s) => s.reducedSensory);

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion={reducedSensory ? "always" : "user"}>
        <TooltipProvider delayDuration={400} skipDelayDuration={200}>
          <StoreHydration />
          <TactileLayer />
          {children}
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
