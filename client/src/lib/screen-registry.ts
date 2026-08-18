/**
 * The screen registry.
 *
 * Every navigable destination in the shell is listed here with what it is for
 * and when it lands. Surfaces that are not built yet render an honest placeholder
 * describing the job they will do — a navigable specification rather than a
 * dead link or a button that does nothing.
 *
 * This is the Phase 2 screen inventory in executable form: when a surface is
 * built, its entry moves from `planned` to `built` and the placeholder route is
 * replaced. Nothing in the navigation may point at a route with no entry here.
 */

export type ScreenSpec = {
  /** What the user is here to do. Written as a job, not a feature list. */
  purpose: string;
  /** The decision or action this screen exists to make possible. */
  primaryAction: string;
  /** Which build phase delivers it, per interface-architecture.md §13. */
  phase: string;
  status: "built" | "planned";
};

export const SCREENS: Record<string, ScreenSpec> = {
  "/today": {
    purpose:
      "Read the operating picture in under a minute: what is live, what changed, what is blocked on you.",
    primaryAction: "Act on the one thing that needs a person",
    phase: "Phase 5",
    status: "built",
  },
  "/preferences": {
    purpose:
      "Set how the interface behaves for you — theme, density, motion, sound and how much technical detail is shown.",
    primaryAction: "Adjust a preference",
    phase: "Phase 3",
    status: "built",
  },

  "/conversations": {
    purpose:
      "Every conversation your AI employees have had, live calls surfaced first. Search by caller or summary, and filter by outcome.",
    primaryAction: "Open a conversation to see its full transcript",
    phase: "Phase 6",
    status: "built",
  },
  "/records": {
    purpose:
      "Everything the AI created or changed — appointments, referrals, callbacks — rendered by record archetype and named in your industry's words.",
    primaryAction: "Open a record and see the conversation that produced it",
    phase: "Phase 6",
    status: "built",
  },
  "/customers": {
    purpose:
      "The person behind the calls: history, consent, and facts separated by whether they were verified, imported, or inferred by the AI.",
    primaryAction: "Confirm or correct what the AI believes",
    phase: "Phase 6",
    status: "built",
  },
  "/review": {
    purpose:
      "The single work queue, grouped by root cause rather than by incident. You fix the missing answer once, not the forty-three calls it affected.",
    primaryAction: "Resolve an issue and send the fix to draft",
    phase: "Phase 6",
    status: "built",
  },

  "/build/employees": {
    purpose:
      "The roster of AI employees, each with a live version and a draft. Persona, granted knowledge and tools, and the authority matrix that decides what it may do alone.",
    primaryAction: "Review what an AI employee is allowed to do",
    phase: "Phase 5",
    status: "built",
  },
  "/build/knowledge": {
    purpose:
      "Sources the AI may answer from, with sync state, coverage, contradictions between sources, and the questions customers ask that nothing answers.",
    primaryAction: "Resolve a conflict or fill a gap",
    phase: "Phase 5",
    status: "built",
  },
  "/build/procedures": {
    purpose:
      "Business processes written as readable procedures rather than node graphs, with a visual map and execution history as secondary views.",
    primaryAction: "Edit a step and test the change",
    phase: "Phase 5",
    status: "built",
  },
  "/build/tools": {
    purpose:
      "Connected systems and the specific actions each one exposes to the AI, with scopes, health, and which employees use them.",
    primaryAction: "Connect a system or fix a failing one",
    phase: "Phase 5",
    status: "built",
  },
  "/build/simulator": {
    purpose:
      "Rehearse against realistic scenarios before a customer meets the change. Simulation chrome is visually distinct so a test is never mistaken for a real call.",
    primaryAction: "Run a scenario suite against the draft",
    phase: "Phase 5",
    status: "built",
  },
  "/build/releases": {
    purpose:
      "What changed, who changed it, and why — with a diff before publishing and a one-action rollback after.",
    primaryAction: "Publish a draft, or roll back a release",
    phase: "Phase 5",
    status: "built",
  },

  "/govern/performance": {
    purpose:
      "Outcomes and effort rather than decorative charts: resolution, escalation reasons, time to resolution, and where the AI is losing calls.",
    primaryAction: "Find which change would move the number",
    phase: "Phase 6",
    status: "built",
  },
  "/govern/channels": {
    purpose:
      "Phone numbers, messaging channels, operating hours, and what happens to a caller when the AI is paused or out of hours.",
    primaryAction: "Set or verify a fallback path",
    phase: "Phase 5",
    status: "built",
  },
  "/govern/people": {
    purpose:
      "Team members, role presets and the capabilities behind them, plus the on-call rota that decides who receives an escalation at 19:40.",
    primaryAction: "Assign a role or fix an escalation path",
    phase: "Phase 6",
    status: "built",
  },
  "/govern/compliance": {
    purpose:
      "Consent, recording law by jurisdiction, retention, and PHI handling — the gates that block deployment rather than settings that can be skipped.",
    primaryAction: "Clear a compliance gate",
    phase: "Phase 6",
    status: "built",
  },
  "/govern/audit": {
    purpose:
      "An immutable record of every action taken by a person or the AI, exportable, with recording access itself logged as an event.",
    primaryAction: "Reconstruct what happened",
    phase: "Phase 6",
    status: "built",
  },
  "/govern/usage": {
    purpose:
      "Spend, pace against budget, cost per resolution, and an explicit choice of what happens when the cap is reached.",
    primaryAction: "Set the budget and the behaviour at the cap",
    phase: "Phase 6",
    status: "built",
  },
  "/govern/workspace": {
    purpose:
      "Organisation, sites, departments, and the lexicon that decides whether this workspace says patients, guests, clients or customers.",
    primaryAction: "Adjust how the workspace is described",
    phase: "Phase 6",
    status: "planned",
  },
};
