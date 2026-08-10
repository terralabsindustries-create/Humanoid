"use client";

import { useSyncExternalStore } from "react";
import { TodayBriefing } from "./today-briefing";
import { DomainDashboard } from "./domain-dashboard";
import { readStoredOnboarding } from "@/lib/store/onboarding";

/**
 * `/today` serves two tenants without forking the route.
 *
 * A browser that just finished onboarding sees the dashboard shaped by
 * whatever it answered. Every other visitor — including anyone who has never
 * touched onboarding at all — sees the existing built-in briefing for
 * Northgate Health, exactly as before. This is the one place that decision is
 * made; neither screen component knows the other exists.
 *
 * `useSyncExternalStore` rather than a mount effect + local state: this is
 * reading a synchronous external source (localStorage), which is exactly
 * what that hook exists for — it renders the server-safe default during
 * hydration and swaps to the real value in the same pass real content would
 * otherwise flash in, with no local state to manage and no effect to gate.
 */
function subscribe(): () => void {
  return () => {};
}

function getSnapshot(): boolean {
  const snapshot = readStoredOnboarding();
  return Boolean(snapshot?.completed && snapshot.industry);
}

function getServerSnapshot(): boolean {
  return false;
}

export function TodayRouter() {
  const domain = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return domain ? <DomainDashboard /> : <TodayBriefing />;
}
