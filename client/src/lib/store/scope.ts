"use client";

import { create } from "zustand";
import type { Scope } from "@/lib/domain/types";

/**
 * Global scope.
 *
 * Every list, metric and live count in the product respects this. Multi-site
 * groups are the design target, and a metric that silently mixes three sites
 * is worse than no metric.
 *
 * Scope belongs in the URL as well, so a link someone pastes into Slack carries
 * the site they were looking at. That sync is a follow-up; the store is the
 * source of truth for now.
 */

const STORAGE_KEY = "humanoid.scope";

type ScopeStore = Scope & {
  hydrated: boolean;
  setLocation(locationId: string | null): void;
  setDepartment(departmentId: string | null): void;
  clear(): void;
  hydrate(): void;
};

function persist(scope: Scope) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scope));
  } catch {
    // Scope degrades to session-only if storage is unavailable.
  }
}

export const useScope = create<ScopeStore>((set, get) => ({
  locationId: null,
  departmentId: null,
  hydrated: false,

  setLocation(locationId) {
    // Changing site clears the department: departments are site-specific and a
    // stale pairing would silently return nothing.
    const next = { locationId, departmentId: null };
    set(next);
    persist(next);
  },

  setDepartment(departmentId) {
    const next = { locationId: get().locationId, departmentId };
    set(next);
    persist(next);
  },

  clear() {
    const next = { locationId: null, departmentId: null };
    set(next);
    persist(next);
  },

  hydrate() {
    if (get().hydrated) return;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const stored = raw ? (JSON.parse(raw) as Scope) : null;
      set({
        locationId: stored?.locationId ?? null,
        departmentId: stored?.departmentId ?? null,
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },
}));

/** Stable object for query keys, so scope changes refetch predictably. */
export function scopeKey(scope: Scope): string {
  return `${scope.locationId ?? "all"}:${scope.departmentId ?? "all"}`;
}
