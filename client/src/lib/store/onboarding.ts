"use client";

import { create } from "zustand";
import type { IndustryPackId } from "@/lib/lexicon";
import type { AnswerValue, OnboardingAnswers } from "@/lib/onboarding/schema";

/**
 * Onboarding state — centralised so no screen component owns a piece of the
 * form. Every step reads and writes here, which is what makes "go back",
 * "change a previous answer" and "refresh without losing progress" work
 * without each screen having to coordinate with its neighbours.
 *
 * Deliberately its own store rather than folded into `preferences` or a
 * catch-all — this state has a completion event (`completeOnboarding`) and a
 * different lifetime (cleared at sign-out, not persisted across accounts).
 */

export type OrganizationInfo = {
  businessName: string;
  website: string;
  country: string;
  companySize: string;
};

const EMPTY_ORGANIZATION: OrganizationInfo = {
  businessName: "",
  website: "",
  country: "",
  companySize: "",
};

const STORAGE_KEY = "humanoid.onboarding";

export type OnboardingSnapshot = {
  /** Set once the "organization setup" step has been persisted to the
   *  backend (`POST /workspaces`). Null means nothing exists server-side
   *  yet — see `lib/onboarding/bootstrap.ts`. */
  workspaceId: string | null;
  organization: OrganizationInfo;
  industry: IndustryPackId | null;
  answers: OnboardingAnswers;
  completedSectionIds: string[];
  completed: boolean;
};

const EMPTY_SNAPSHOT: OnboardingSnapshot = {
  workspaceId: null,
  organization: EMPTY_ORGANIZATION,
  industry: null,
  answers: {},
  completedSectionIds: [],
  completed: false,
};

type OnboardingStore = OnboardingSnapshot & {
  hydrated: boolean;
  setOrganization(info: OrganizationInfo): void;
  setWorkspaceId(id: string): void;
  setIndustry(id: IndustryPackId): void;
  setAnswer(questionId: string, value: AnswerValue): void;
  markSectionComplete(sectionId: string): void;
  completeOnboarding(): void;
  /** Overwrites local state with the backend's — the backend is
   *  authoritative, so this always wins over whatever was cached locally. */
  hydrateFromServer(snapshot: OnboardingSnapshot): void;
  reset(): void;
  hydrate(): void;
};

function persist(snapshot: OnboardingSnapshot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Onboarding degrades to tab-only progress if storage is unavailable —
    // still usable in one sitting, just not resumable after a refresh.
  }
}

function snapshotOf(state: OnboardingStore): OnboardingSnapshot {
  return {
    workspaceId: state.workspaceId,
    organization: state.organization,
    industry: state.industry,
    answers: state.answers,
    completedSectionIds: state.completedSectionIds,
    completed: state.completed,
  };
}

export const useOnboarding = create<OnboardingStore>((set, get) => ({
  ...EMPTY_SNAPSHOT,
  hydrated: false,

  setOrganization(organization) {
    set({ organization });
    persist({ ...snapshotOf(get()), organization });
  },

  setWorkspaceId(workspaceId) {
    set({ workspaceId });
    persist({ ...snapshotOf(get()), workspaceId });
  },

  setIndustry(industry) {
    // Changing industry invalidates section progress and answers from the
    // previous pack — a hospitality answer to "room_count" has no home in a
    // legal pack's schema, and keeping it around would silently corrupt the
    // next pack's review screen.
    const next = { industry, answers: {}, completedSectionIds: [] };
    set(next);
    persist({ ...snapshotOf(get()), ...next });
  },

  setAnswer(questionId, value) {
    const answers = { ...get().answers, [questionId]: value };
    set({ answers });
    persist({ ...snapshotOf(get()), answers });
  },

  markSectionComplete(sectionId) {
    if (get().completedSectionIds.includes(sectionId)) return;
    const completedSectionIds = [...get().completedSectionIds, sectionId];
    set({ completedSectionIds });
    persist({ ...snapshotOf(get()), completedSectionIds });
  },

  completeOnboarding() {
    set({ completed: true });
    persist({ ...snapshotOf(get()), completed: true });
  },

  hydrateFromServer(snapshot) {
    set({ ...snapshot, hydrated: true });
    persist(snapshot);
  },

  reset() {
    set({ ...EMPTY_SNAPSHOT });
    persist(EMPTY_SNAPSHOT);
  },

  hydrate() {
    if (get().hydrated) return;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const stored = raw ? (JSON.parse(raw) as Partial<OnboardingSnapshot>) : {};
      set({ ...EMPTY_SNAPSHOT, ...stored, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
}));

/** Read the persisted snapshot synchronously, outside React — used by the
 *  root route to decide where to send a visitor before the store hydrates. */
export function readStoredOnboarding(): OnboardingSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return { ...EMPTY_SNAPSHOT, ...(JSON.parse(raw) as Partial<OnboardingSnapshot>) };
  } catch {
    return null;
  }
}
