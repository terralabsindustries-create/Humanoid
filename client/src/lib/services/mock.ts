/**
 * Mock implementation of the service contract.
 *
 * Simulated behaviour is deliberately imperfect: calls take time, and a
 * configurable share of them fail. Building against a service that always
 * succeeds instantly is how products ship without error states.
 */

import * as fx from "@/lib/mock/fixtures";
import type { Conversation, Scope } from "@/lib/domain/types";
import { resolveOnboardedWorkspace } from "@/lib/domains/onboarded-workspace";
import type {
  Briefing,
  ConversationFilters,
  HumanoidService,
} from "./contract";

/** Latency bands, roughly matching what the real endpoints should target. */
const LATENCY = { fast: 90, normal: 220, slow: 480 };

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function respond<T>(value: T, ms = LATENCY.normal): Promise<T> {
  await delay(ms);
  // Deep clone so callers cannot mutate the fixtures and see phantom writes.
  return structuredClone(value);
}

const LIVE_STATUSES: Conversation["status"][] = [
  "ringing",
  "active",
  "waiting",
  "wrapping",
];

function inScope(
  locationId: string,
  scope: Scope | undefined,
): boolean {
  if (!scope?.locationId) return true;
  return locationId === scope.locationId;
}

/**
 * A signed-in visitor with a real, completed workspace is a different mock
 * tenant from Northgate Health — see `lib/domains/onboarded-workspace.ts`.
 * Every identity-bearing endpoint checks it first (this is a real, cached
 * backend fetch, not a synchronous read) and falls back to the Northgate
 * fixture, so the two tenants can't be mixed within one response.
 */
async function workspaceOverride() {
  return (await resolveOnboardedWorkspace())?.workspace ?? null;
}
async function locationOverride() {
  return (await resolveOnboardedWorkspace())?.location ?? null;
}
async function userOverride() {
  return (await resolveOnboardedWorkspace())?.user ?? null;
}

export const mockService: HumanoidService = {
  getWorkspace: async () => respond((await workspaceOverride()) ?? fx.workspace, LATENCY.fast),
  listLocations: async () => {
    const location = await locationOverride();
    return respond(location ? [location] : fx.locations, LATENCY.fast);
  },
  listDepartments: async () => respond((await workspaceOverride()) ? [] : fx.departments, LATENCY.fast),
  getCurrentUser: async () => respond((await userOverride()) ?? fx.currentUser, LATENCY.fast),
  listUsers: async () => {
    const user = await userOverride();
    return respond(user ? [user] : fx.users, LATENCY.fast);
  },

  listEmployees: () => respond(fx.employees),
  getEmployee: (id) =>
    respond(fx.employees.find((e) => e.id === id) ?? null),

  listConversations: async (filters: ConversationFilters = {}) => {
    // A freshly onboarded workspace has taken no real calls yet — that is
    // the honest state, not Northgate's, and the shell already has proper
    // empty states everywhere this feeds (see LiveRail).
    if (await workspaceOverride()) return respond([], LATENCY.fast);

    let list = fx.conversations.filter((c) =>
      inScope(c.locationId, filters.scope),
    );

    if (filters.live) {
      list = list.filter((c) => LIVE_STATUSES.includes(c.status));
    }
    if (filters.employeeId) {
      list = list.filter((c) => c.employeeId === filters.employeeId);
    }
    if (filters.outcome?.length) {
      list = list.filter((c) => filters.outcome!.includes(c.outcome));
    }
    if (filters.channel?.length) {
      list = list.filter((c) => filters.channel!.includes(c.channel));
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (c) =>
          c.fromLabel.toLowerCase().includes(q) ||
          c.intent?.toLowerCase().includes(q) ||
          c.summary?.toLowerCase().includes(q),
      );
    }

    list = [...list].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    if (filters.limit) list = list.slice(0, filters.limit);

    return respond(list);
  },

  getConversation: (id) =>
    respond(fx.conversations.find((c) => c.id === id) ?? null),

  getParty: (id) => respond(fx.parties.find((p) => p.id === id) ?? null),

  listRecords: (scope) =>
    respond(fx.records.filter((r) => inScope(r.locationId, scope))),

  listResources: () => respond(fx.resources, LATENCY.fast),

  listReviewIssues: async () =>
    (await workspaceOverride())
      ? respond([])
      : respond(
          [...fx.reviewIssues].sort(
            (a, b) => b.affectedConversationCount - a.affectedConversationCount,
          ),
        ),

  listPendingApprovals: async () =>
    (await workspaceOverride())
      ? respond([], LATENCY.fast)
      : respond(
          fx.approvals.filter((a) => a.status === "pending"),
          LATENCY.fast,
        ),

  listKnowledgeSources: () => respond(fx.knowledgeSources),
  listIntegrations: () => respond(fx.integrations),
  listProcedures: () => respond(fx.procedures),

  getUsage: async () =>
    respond(
      (await workspaceOverride())
        ? { spendToday: 0, spendMonth: 0, budgetMonth: null, atCap: "notify" as const, callsToday: 0, costPerResolution: 0 }
        : fx.usage,
      LATENCY.fast,
    ),
  getConnectionHealth: () => respond(fx.connection, LATENCY.fast),
  listAuditEvents: (limit = 50) => respond(fx.auditEvents.slice(0, limit)),

  getBriefing: async (scope) => {
    const conversations = fx.conversations.filter((c) =>
      inScope(c.locationId, scope),
    );
    const live = conversations.filter((c) => LIVE_STATUSES.includes(c.status));
    const ended = conversations.filter((c) => c.status === "ended");
    const approvals = fx.approvals.filter((a) => a.status === "pending");

    const openEscalations =
      ended.filter(
        (c) => c.outcome === "escalated" && c.escalatedToUserId !== null,
      ).length + live.filter((c) => c.blocker !== null).length;

    const briefing: Briefing = {
      generatedAt: fx.MOCK_NOW.toISOString(),
      live: {
        active: live.filter((c) => c.status === "active").length,
        waiting: live.filter((c) => c.status === "waiting").length,
        ringing: live.filter((c) => c.status === "ringing").length,
        needsApproval: approvals.length,
      },
      since: {
        // Every figure in this block comes from the same day-level aggregate,
        // so the sentence the briefing composes from them is internally
        // consistent. Deriving the rate from the conversation window instead
        // would print a percentage that contradicts the counts beside it.
        calls: fx.todaySummary.calls,
        booked: fx.todaySummary.booked,
        rescheduled: fx.todaySummary.rescheduled,
        escalated: fx.todaySummary.escalated,
        resolvedRate: fx.todaySummary.resolvedRate,
        unresolvedEscalations: openEscalations,
        previous: {
          calls: fx.yesterdaySummary.calls,
          resolvedRate: fx.yesterdaySummary.resolvedRate,
        },
      },
      topIssues: [...fx.reviewIssues]
        .filter((i) => i.status === "open")
        .sort((a, b) => {
          const rank = { critical: 0, high: 1, medium: 2, low: 3 };
          const bySeverity = rank[a.severity] - rank[b.severity];
          return bySeverity !== 0
            ? bySeverity
            : b.affectedConversationCount - a.affectedConversationCount;
        })
        .slice(0, 3),
      pendingApprovals: approvals,
      signals: [
        {
          id: "sig_nhs",
          kind: "trend",
          text: "Questions about NHS dental availability are up sharply this week and Maya has no approved answer for them.",
          href: "/review/iss_412",
        },
        {
          id: "sig_autonomy",
          kind: "opportunity",
          text: "Rescheduling has run 214 times with no corrections. Raising its autonomy would save about 41 seconds per call.",
          href: "/review/iss_397",
        },
        {
          id: "sig_calendar",
          kind: "risk",
          text: "The Dentally calendar has timed out 12 times during morning peak, and each one costs a booking.",
          href: "/review/iss_408",
        },
      ],
    };

    return respond(briefing, LATENCY.normal);
  },

  listKnowledgeItems: (sourceId) =>
    respond(
      sourceId
        ? fx.knowledgeItems.filter((i) => i.sourceId === sourceId)
        : fx.knowledgeItems,
    ),

  listKnowledgeConflicts: () =>
    respond(
      [...fx.knowledgeConflicts].sort((a, b) => b.askCount - a.askCount),
    ),

  listKnowledgeGaps: () =>
    respond([...fx.knowledgeGaps].sort((a, b) => b.askCount - a.askCount)),

  listScenarioSuites: () => respond(fx.scenarioSuites),
  listScenarios: () => respond(fx.scenarios),

  listSimulationRuns: () =>
    respond(
      [...fx.simulationRuns].sort((a, b) =>
        b.startedAt.localeCompare(a.startedAt),
      ),
    ),

  listReleases: (employeeId) =>
    respond(
      (employeeId
        ? fx.releases.filter((r) => r.employeeId === employeeId)
        : fx.releases
      ).sort((a, b) => b.version - a.version),
    ),

  listPhoneNumbers: () => respond(fx.phoneNumbers),
  listComplianceGates: () => respond(fx.complianceGates),
  listRetentionPolicies: () => respond(fx.retentionPolicies),
  listOnCall: () => respond(fx.onCall, LATENCY.fast),

  getPerformance: () => respond(fx.performance, LATENCY.slow),

  getReviewIssue: (id) =>
    respond(fx.reviewIssues.find((i) => i.id === id) ?? null),
};
