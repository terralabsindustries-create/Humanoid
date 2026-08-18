/**
 * Mock implementation of the service contract.
 *
 * Simulated behaviour is deliberately imperfect: calls take time, and a
 * configurable share of them fail. Building against a service that always
 * succeeds instantly is how products ship without error states.
 */

import * as fx from "@/lib/mock/fixtures";
import type {
  AIEmployee,
  AuditEvent,
  BlockerType,
  Conversation,
  FallbackBehaviour,
  KnowledgeConflict,
  KnowledgeGap,
  KnowledgeItem,
  KnowledgeSource,
  OnCallEntry,
  Party,
  PerformancePoint,
  Procedure,
  Release,
  ScenarioResult,
  Scope,
  SimulationRun,
  UsageSnapshot,
  User,
} from "@/lib/domain/types";
import { resolveOnboardedWorkspace } from "@/lib/domains/onboarded-workspace";
import {
  authoredSource,
  rankConflicts,
  rankGaps,
} from "@/lib/domain/knowledge";
import { rankIssues } from "@/lib/domain/review";
import { toCsv } from "@/lib/domain/audit";
import { ROLE_CAPABILITIES, isOwner } from "@/lib/domain/people";
import { gateForVersion } from "@/lib/domain/releases";
import { getRealConversation, listRealConversations } from "@/lib/domains/real-conversations";
import { getRealEmployee, listRealEmployees } from "@/lib/domains/real-employees";
import { now } from "@/lib/utils/time";
import type {
  Briefing,
  ConversationFilters,
  GapAnswered,
  HumanoidService,
  PartyFilters,
  RecordFilters,
  SimulationRunInput,
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
 * One site's slice of a group-wide day.
 *
 * The performance series is authored at group level, so a single-site view is
 * derived rather than separately invented. `resolved` absorbs the rounding so
 * `calls` still equals the four outcomes added up, which `PerformancePoint`
 * promises and the whole surface relies on.
 */
function siteSlice(
  point: PerformancePoint,
  siteShare: number,
): PerformancePoint {
  if (siteShare === 1) return point;
  const scale = (n: number) => Math.round(n * siteShare);
  const calls = scale(point.calls);
  const escalated = scale(point.escalated);
  const abandoned = scale(point.abandoned);
  const failed = scale(point.failed);
  return {
    ...point,
    calls,
    resolved: Math.max(0, calls - escalated - abandoned - failed),
    escalated,
    abandoned,
    failed,
    clarificationTurns: scale(point.clarificationTurns),
    repeats: scale(point.repeats),
  };
}

/**
 * Split a total across fixed shares so the parts add back up to it exactly.
 * Rounding each share on its own loses or gains a call, and a breakdown that
 * doesn't reconcile with the number it claims to explain is worse than none.
 */
function splitByMix(
  total: number,
  mix: { blocker: BlockerType; share: number }[],
): { blocker: BlockerType; count: number }[] {
  const exact = mix.map((m) => total * m.share);
  const counts = exact.map(Math.floor);
  let remainder = total - counts.reduce((n, c) => n + c, 0);
  // Largest fractional part first, so leftovers land on the rows that earned
  // them rather than on whichever happens to be listed first.
  const byFraction = exact
    .map((value, i) => ({ i, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const { i } of byFraction) {
    if (remainder <= 0) break;
    counts[i] += 1;
    remainder -= 1;
  }
  return mix
    .map((m, i) => ({ blocker: m.blocker, count: counts[i] }))
    .filter((entry) => entry.count > 0);
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

/**
 * Party records are the one thing this mock accepts writes to, because
 * confirming what the AI believes is the *point* of the customer directory —
 * a version of that screen whose buttons do nothing would be a fake button,
 * not a mock. Writes land in this session-lived copy rather than in the
 * fixture module, so a reload returns to the authored state and nothing here
 * can be mistaken for persistence.
 */
const partyState: Party[] = structuredClone(fx.parties);

/**
 * The audit log accepts one write, and only from the server side of the
 * boundary: exporting it appends the `audit.export` entry that records the
 * export. That is not a convenience — it is the property the screen exists to
 * demonstrate, and asserting it in prose while the log stayed static would be
 * the weaker half of a claim this surface is supposed to prove.
 */
const auditState: AuditEvent[] = structuredClone(fx.auditEvents);

/**
 * Deployments accept a write for the same reason party facts do: Channels
 * exists so somebody can set where a caller lands when the AI is not
 * answering, and a version of that screen whose only control did nothing
 * would be a fake button rather than a mock. Session-lived, so a reload
 * returns to the authored configuration and nothing here reads as persisted.
 */
const employeeState: AIEmployee[] = structuredClone(fx.employees);

/**
 * Same reason as `employeeState`: the budget and cap behaviour are the one
 * control this surface has, and a screen whose only control did nothing
 * would be a fake button rather than a mock. Session-lived, so a reload
 * returns to the authored budget and nothing here reads as persisted. The
 * shell's spend indicator reads this same copy, so changing the budget here
 * is visible there too rather than the two silently disagreeing.
 */
const usageState: UsageSnapshot = structuredClone(fx.usage);

function setFallback(
  deploymentId: string,
  fallback: FallbackBehaviour,
): AIEmployee {
  const employee = employeeState.find((candidate) =>
    candidate.deployments.some((d) => d.id === deploymentId),
  );
  const deployment = employee?.deployments.find((d) => d.id === deploymentId);
  if (!employee || !deployment) {
    throw new Error(`No such deployment: ${deploymentId}`);
  }

  deployment.fallback = fallback;
  return employee;
}

/**
 * Releases accept writes for the same reason: publishing a draft and rolling
 * a release back *are* the Releases surface, and a screen whose two controls
 * are permanently disabled is a specification with buttons drawn on it. Same
 * session-lived copy, same reset on reload.
 *
 * What this does not do is pretend the change reaches anything. Publishing
 * here moves a release record and nothing else — there is no employee runtime
 * behind it to reconfigure, and `AIEmployee.liveVersion` is deliberately left
 * alone rather than edited to imply one.
 */
const releaseState: Release[] = structuredClone(fx.releases);

function requireRelease(id: string): Release {
  const release = releaseState.find((candidate) => candidate.id === id);
  if (!release) throw new Error(`No such release: ${id}`);
  return release;
}

/**
 * People and the rota are the third: assigning a role and moving the pager
 * *are* People & roles. Same session-lived copy, same reset on reload.
 *
 * The guards below are enforced here rather than only in the screen on purpose.
 * A permissions surface whose only protection is a disabled button teaches the
 * wrong lesson about where authorisation lives — when this reaches a real
 * backend the identical checks belong on the server, and writing them here
 * first means the screen is already built against a service that says no.
 */
const peopleState: User[] = structuredClone(fx.users);
const rotaState: OnCallEntry[] = structuredClone(fx.onCall);

function requireUser(id: string): User {
  const user = peopleState.find((candidate) => candidate.id === id);
  if (!user) throw new Error(`No such person: ${id}`);
  return user;
}

/** The signed-in person, read from the mutable copy so a change to them lands. */
function currentPerson(): User {
  return (
    peopleState.find((user) => user.id === fx.currentUser.id) ?? fx.currentUser
  );
}

/**
 * Simulation runs are the fourth, and the clearest case of the lot: running a
 * suite *is* the Simulator. A Run button that did nothing would leave a screen
 * whose entire purpose is an action with no action in it.
 *
 * Two things make this a mock rather than a fake backend. Results are
 * deterministic — a scenario resolves to whatever the authored runs recorded
 * for it — so the findings a person reads are the written ones, and re-running
 * an unchanged draft says the same thing twice. A simulator whose verdict
 * wandered on its own would be worse than no simulator, and a random one would
 * be exactly that. And nothing here rehearses anything: there is no AI runtime
 * behind these runs, so a run replays a recorded verdict rather than
 * discovering one. When simulation becomes real it gets its own backend module
 * and its own tables; this array is not a draft of that schema.
 */
const runState: SimulationRun[] = structuredClone(fx.simulationRuns);

/**
 * Knowledge is the fifth, and the two writes it accepts are the two decisions
 * the screen exists to collect: which source wins when two disagree, and what
 * the answer is to a question nothing covers. Both are judgements only a person
 * holds — no amount of ingestion produces them — so a Knowledge surface that
 * could not take them would be a report, not a place to fix anything.
 *
 * The honesty line runs through the *result*, not the write. Answering a gap
 * produces a `draft` item and leaves the gap standing, because nothing here can
 * publish: there is no employee runtime, so callers are still being declined
 * that question until a release carries the answer to it. Resolving a conflict
 * records the decision and leaves both claims on the record — a source that was
 * wrong once is evidence of why the decision was needed, and deleting it would
 * erase that. Same session-lived copies, same reset on reload.
 */
/**
 * Procedures are the fourth, and the honesty line is drawn in the *shape* of
 * the write rather than by refusing it. Rewriting a step never touches the
 * wording the AI is using — it sets `step.draft` beside it — so the mock cannot
 * accidentally imply that typing changed what a caller hears. Publishing that
 * draft is Releases' job and does not exist here. Session-lived, reset on
 * reload, like the three above.
 */
const procedureState: Procedure[] = structuredClone(fx.procedures);

function requireStep(procedureId: string, stepId: string) {
  const procedure = procedureState.find((p) => p.id === procedureId);
  if (!procedure) throw new Error(`No such procedure: ${procedureId}`);
  const step = procedure.steps.find((s) => s.id === stepId);
  if (!step) throw new Error(`No step ${stepId} in ${procedureId}`);
  return { procedure, step };
}

const sourceState: KnowledgeSource[] = structuredClone(fx.knowledgeSources);
const itemState: KnowledgeItem[] = structuredClone(fx.knowledgeItems);
const conflictState: KnowledgeConflict[] = structuredClone(fx.knowledgeConflicts);
const gapState: KnowledgeGap[] = structuredClone(fx.knowledgeGaps);

function resolveConflict(conflictId: string, sourceId: string): KnowledgeConflict {
  const conflict = conflictState.find((c) => c.id === conflictId);
  if (!conflict) throw new Error(`No such conflict: ${conflictId}`);
  if (!conflict.claims.some((claim) => claim.sourceId === sourceId)) {
    throw new Error("That source makes no claim on this topic");
  }

  // Only the first decision clears the counter. Changing your mind later moves
  // the choice between two sources that are both already accounted for, and
  // decrementing again would drive a source's conflict count below zero.
  if (conflict.status === "unresolved") {
    for (const claim of conflict.claims) {
      const source = sourceState.find((s) => s.id === claim.sourceId);
      if (source) source.conflictCount = Math.max(0, source.conflictCount - 1);
    }
  }

  conflict.status = "resolved";
  conflict.resolvedSourceId = sourceId;
  return conflict;
}

function answerGap(gapId: string, answer: string): GapAnswered {
  const gap = gapState.find((g) => g.id === gapId);
  if (!gap) throw new Error(`No such gap: ${gapId}`);

  const text = answer.trim();
  if (!text) throw new Error("An answer cannot be empty");

  // Written answers land in the source that is maintained here. Writing into a
  // crawled site or an uploaded PDF would be overwritten by its next sync.
  const target = authoredSource(sourceState);
  if (!target) throw new Error("This workspace has nowhere to write an answer");

  const existing = gap.draftItemId
    ? itemState.find((item) => item.id === gap.draftItemId)
    : undefined;

  if (existing) {
    existing.answer = text;
    existing.updatedAt = new Date(now()).toISOString();
    return { gap, item: existing };
  }

  const item: KnowledgeItem = {
    id: `kn_${gap.id}`,
    sourceId: target.id,
    question: gap.question,
    answer: text,
    // Zero, and it stays zero until this is published. A use count is a record
    // of calls this answer has actually shaped, and a draft has shaped none.
    useCount: 0,
    updatedAt: new Date(now()).toISOString(),
    status: "draft",
  };

  itemState.push(item);
  target.itemCount += 1;
  gap.draftItemId = item.id;
  return { gap, item };
}

/** Ids continue past the authored runs so a new one never collides. */
let runSequence = 400;

/** How long one scenario takes to resolve. Scenarios resolve one at a time. */
const SCENARIO_MS = 850;

/** The verdict on record for a scenario, newest authored run first. */
function authoredResult(scenarioId: string): ScenarioResult | null {
  for (const run of fx.simulationRuns) {
    const result = run.results.find((r) => r.scenarioId === scenarioId);
    if (result) return result;
  }
  return null;
}

function startRun(input: SimulationRunInput): SimulationRun {
  const suite = fx.scenarioSuites.find((s) => s.id === input.suiteId);
  if (!suite) throw new Error(`No such suite: ${input.suiteId}`);

  const run: SimulationRun = {
    id: `run_${(runSequence += 1)}`,
    suiteId: suite.id,
    employeeId: input.employeeId,
    employeeVersionId: input.employeeVersionId,
    startedAt: new Date(now()).toISOString(),
    finishedAt: null,
    status: "running",
    results: [],
    triggeredByUserId: fx.currentUser.id,
  };
  runState.unshift(run);

  // Scenarios land one at a time, in order, because that is what the screen
  // has to be able to render: a suite that returned all its results at once
  // would leave "running" as a spinner over an empty box, and a progress bar
  // filling while nothing is knowable is a worse lie than no progress at all.
  suite.scenarioIds.forEach((scenarioId, index) => {
    setTimeout(
      () => {
        run.results.push(
          authoredResult(scenarioId) ?? {
            scenarioId,
            status: "passed",
            finding: null,
            durationSeconds: 45,
          },
        );

        if (run.results.length === suite.scenarioIds.length) {
          run.status = "complete";
          run.finishedAt = new Date(now()).toISOString();
        }
      },
      (index + 1) * SCENARIO_MS,
    );
  });

  return run;
}

/** Which sites a person shows up at: their own, plus anywhere they appear. */
function partyLocationIds(party: Party): Set<string> {
  const ids = new Set<string>();
  if (party.homeLocationId) ids.add(party.homeLocationId);
  for (const conversation of fx.conversations) {
    if (conversation.partyId === party.id) ids.add(conversation.locationId);
  }
  for (const record of fx.records) {
    if (record.partyId === party.id) ids.add(record.locationId);
  }
  return ids;
}

const UNCONFIRMED: Party["facts"][number]["source"][] = [
  "ai_inferred",
  "unverified",
];

function editFact(
  partyId: string,
  label: string,
  value?: string,
): Party {
  const party = partyState.find((p) => p.id === partyId);
  if (!party) throw new Error(`No such record: ${partyId}`);

  const fact = party.facts.find((f) => f.label === label);
  if (!fact) throw new Error(`No fact "${label}" on ${partyId}`);

  // A person signing off on a value is what "verified" means — there is no
  // other way for a fact to reach that state.
  fact.value = value ?? fact.value;
  fact.source = "verified";
  fact.updatedAt = new Date(now()).toISOString();

  return party;
}

export const mockService: HumanoidService = {
  getWorkspace: async () => respond((await workspaceOverride()) ?? fx.workspace, LATENCY.fast),
  listLocations: async () => {
    const location = await locationOverride();
    return respond(location ? [location] : fx.locations, LATENCY.fast);
  },
  listDepartments: async () => respond((await workspaceOverride()) ? [] : fx.departments, LATENCY.fast),
  getCurrentUser: async () => respond((await userOverride()) ?? currentPerson(), LATENCY.fast),
  listUsers: async () => {
    const user = await userOverride();
    return respond(user ? [user] : peopleState, LATENCY.fast);
  },

  // A workspace onboarded this morning has its own AI employee — created by
  // onboarding, stored in Postgres, served by the real backend — and it is not
  // Maya. So the roster is the second thing decided per request rather than per
  // workspace (after conversations): a real tenant reads its own employee from
  // the real endpoint, Northgate keeps its fixture, and the two never mix
  // (rule 12). What the real record cannot yet carry — an authority matrix,
  // grants, a voice, a deployment — comes back empty rather than borrowed; see
  // `lib/domains/real-employees.ts`.
  listEmployees: async () => {
    const resolved = await resolveOnboardedWorkspace();
    if (resolved) {
      const list = await listRealEmployees(
        resolved.workspace.id,
        resolved.workspace.industry,
      );
      return respond(list, LATENCY.fast);
    }
    return respond(employeeState);
  },

  getEmployee: async (id) => {
    const resolved = await resolveOnboardedWorkspace();
    if (resolved) {
      const employee = await getRealEmployee(
        resolved.workspace.id,
        resolved.workspace.industry,
        id,
      );
      return respond(employee, LATENCY.fast);
    }
    return respond(employeeState.find((e) => e.id === id) ?? null);
  },

  listConversations: async (filters: ConversationFilters = {}) => {
    // A real onboarded tenant reads its own calls from the Twilio-backed
    // conversations module rather than borrowing Northgate's — see
    // `lib/domains/real-conversations.ts`.
    const resolved = await resolveOnboardedWorkspace();
    if (resolved) {
      const list = await listRealConversations(resolved.workspace.id, resolved.location.id, filters);
      return respond(list, LATENCY.fast);
    }

    let list = fx.conversations.filter((c) =>
      inScope(c.locationId, filters.scope),
    );

    if (filters.live) {
      list = list.filter((c) => LIVE_STATUSES.includes(c.status));
    }
    if (filters.employeeId) {
      list = list.filter((c) => c.employeeId === filters.employeeId);
    }
    if (filters.partyId) {
      list = list.filter((c) => c.partyId === filters.partyId);
    }
    if (filters.procedureId) {
      list = list.filter(
        (c) => c.procedureRun?.procedureId === filters.procedureId,
      );
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

  getConversation: async (id) => {
    const resolved = await resolveOnboardedWorkspace();
    if (resolved) {
      const conversation = await getRealConversation(resolved.workspace.id, resolved.location.id, id);
      return respond(conversation, LATENCY.fast);
    }
    return respond(fx.conversations.find((c) => c.id === id) ?? null);
  },

  listParties: async (filters: PartyFilters = {}) => {
    // Same rule as conversations: a workspace onboarded five minutes ago has
    // no customer history, and borrowing Northgate's would be a lie the rest
    // of the shell then has to keep.
    if (await workspaceOverride()) return respond([], LATENCY.fast);

    let list = partyState;

    if (filters.scope?.locationId) {
      const locationId = filters.scope.locationId;
      list = list.filter((p) => partyLocationIds(p).has(locationId));
    }
    if (filters.unconfirmedOnly) {
      list = list.filter((p) =>
        p.facts.some((f) => UNCONFIRMED.includes(f.source)),
      );
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (p) =>
          p.displayName.toLowerCase().includes(q) ||
          p.phone?.replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
          p.email?.toLowerCase().includes(q) ||
          // Both halves of a fact: "step-free access" is the label and
          // "Noted by reception" is the value, and a receptionist looking
          // someone up types the first one.
          p.facts.some(
            (f) =>
              f.label.toLowerCase().includes(q) ||
              f.value.toLowerCase().includes(q),
          ),
      );
    }

    // Most recent contact first: the person who just rang is the person most
    // likely to be looked up.
    list = [...list].sort((a, b) =>
      (b.lastContactAt ?? b.createdAt).localeCompare(
        a.lastContactAt ?? a.createdAt,
      ),
    );
    if (filters.limit) list = list.slice(0, filters.limit);

    return respond(list);
  },

  getParty: (id) => respond(partyState.find((p) => p.id === id) ?? null),

  confirmPartyFact: ({ partyId, label }) =>
    respond(editFact(partyId, label), LATENCY.fast),

  correctPartyFact: ({ partyId, label, value }) =>
    respond(editFact(partyId, label, value), LATENCY.fast),

  listRecords: async (filters: RecordFilters = {}) => {
    // Same rule as conversations and parties: a workspace onboarded this
    // morning has an empty diary, and showing it Northgate's would merge two
    // tenants on the one screen whose whole job is "what did the AI do here".
    if (await workspaceOverride()) return respond([], LATENCY.fast);

    let list = fx.records.filter(
      (r) =>
        inScope(r.locationId, filters.scope) &&
        (!filters.partyId || r.partyId === filters.partyId) &&
        (!filters.archetype?.length ||
          filters.archetype.includes(r.archetype)) &&
        (!filters.status?.length || filters.status.includes(r.status)),
    );

    if (filters.createdByAiOnly) {
      list = list.filter((r) => r.createdByConversationId !== null);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const partyName = (id: string | null) =>
        partyState.find((p) => p.id === id)?.displayName.toLowerCase() ?? "";
      list = list.filter(
        (r) =>
          r.typeId.toLowerCase().includes(q) ||
          r.status.toLowerCase().includes(q) ||
          partyName(r.partyId).includes(q) ||
          Object.values(r.fields).some((v) =>
            String(v ?? "").toLowerCase().includes(q),
          ),
      );
    }

    // Soonest first for anything with a time, and everything timeless after it
    // in the order the AI raised it. Sorting is the service's job because two
    // screens reading this list must not disagree about what "first" means.
    list = [...list].sort((a, b) => {
      if (a.scheduledAt && b.scheduledAt) {
        return a.scheduledAt.localeCompare(b.scheduledAt);
      }
      if (a.scheduledAt) return -1;
      if (b.scheduledAt) return 1;
      return b.createdAt.localeCompare(a.createdAt);
    });

    return respond(list);
  },

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

  listKnowledgeSources: async () =>
    (await workspaceOverride()) ? respond([], LATENCY.fast) : respond(sourceState),
  // A workspace onboarded this morning has connected nothing, and Northgate's
  // Dentally connection appearing under someone else's name is the exact tenant
  // merge rule 12 exists to prevent. The empty state this produces is the true
  // one — and it is the only honest place for "you have not connected anything
  // yet" to be said.
  listIntegrations: async () =>
    (await workspaceOverride())
      ? respond([], LATENCY.fast)
      : respond(fx.integrations),
  listTools: async () =>
    (await workspaceOverride()) ? respond([], LATENCY.fast) : respond(fx.tools),
  listProcedures: () => respond(procedureState),
  getProcedure: (id) =>
    respond(procedureState.find((p) => p.id === id) ?? null),

  editProcedureStep: ({ procedureId, stepId, instruction, fallback }) => {
    const { procedure, step } = requireStep(procedureId, stepId);

    // A rewrite identical to what is live is not a change, and leaving a draft
    // behind that says nothing would put a "not published yet" marker on a step
    // nobody has actually edited.
    if (
      instruction.trim() === step.instruction &&
      fallback.trim() === step.fallback
    ) {
      step.draft = null;
    } else {
      step.draft = {
        instruction: instruction.trim(),
        fallback: fallback.trim(),
        editedAt: new Date(now()).toISOString(),
        editedByUserId: fx.currentUser.id,
      };
    }

    return respond(procedure, LATENCY.fast);
  },

  discardProcedureStepDraft: ({ procedureId, stepId }) => {
    const { procedure, step } = requireStep(procedureId, stepId);
    step.draft = null;
    return respond(procedure, LATENCY.fast);
  },

  getUsage: async () =>
    respond(
      (await workspaceOverride())
        ? { spendToday: 0, spendMonth: 0, budgetMonth: null, atCap: "notify" as const, callsToday: 0, costPerResolution: 0 }
        : usageState,
      LATENCY.fast,
    ),
  setBudget: ({ budgetMonth, atCap }) => {
    usageState.budgetMonth = budgetMonth;
    usageState.atCap = atCap;
    return respond(usageState, LATENCY.fast);
  },
  getConnectionHealth: () => respond(fx.connection, LATENCY.fast),
  listAuditEvents: (limit = 50) => respond(auditState.slice(0, limit)),

  exportAuditEvents: async (eventIds) => {
    const wanted = new Set(eventIds);
    const chosen = auditState.filter((event) => wanted.has(event.id));
    // `userOverride` reaches for the real tenant and rethrows anything that is
    // not a 401/404, so an unreachable backend would otherwise fail an export
    // out of a service that is entirely fixture-backed. Attribution falls back
    // to the fixture user, which is who this mock's log belongs to anyway.
    const actor = (await userOverride().catch(() => null)) ?? fx.currentUser;
    const at = new Date(now()).toISOString();

    const recorded: AuditEvent = {
      id: `aud_export_${auditState.length}`,
      at,
      actor: { kind: "user", id: actor.id, label: actor.name },
      action: "audit.export",
      target: `${chosen.length} ${chosen.length === 1 ? "entry" : "entries"}`,
      detail: `Exported ${chosen.length} ${chosen.length === 1 ? "entry" : "entries"} as CSV`,
    };

    // Unshifted, not pushed: the log reads newest first and the export is the
    // most recent thing that happened to it.
    auditState.unshift(recorded);

    return respond({
      csv: toCsv(chosen),
      filename: `audit-log-${at.slice(0, 10)}.csv`,
      recorded,
    });
  },

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
      // The same ranking the Review queue uses. Two orderings of the same
      // list is how a briefing ends up recommending something the queue has
      // in fourth place.
      topIssues: rankIssues(
        fx.reviewIssues.filter((i) => i.status === "open"),
      ).slice(0, 3),
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

  // A workspace onboarded this morning has imported nothing and has taken no
  // calls, so it has no sources, no contradictions and no record of what it
  // could not answer. Northgate's dental knowledge under a stranger's name
  // would be the worst possible lie for this surface in particular: it is the
  // screen that says what the AI is allowed to tell customers.
  listKnowledgeItems: async (sourceId) =>
    (await workspaceOverride())
      ? respond([], LATENCY.fast)
      : respond(
          sourceId
            ? itemState.filter((i) => i.sourceId === sourceId)
            : itemState,
        ),

  listKnowledgeConflicts: async () =>
    (await workspaceOverride())
      ? respond([], LATENCY.fast)
      : respond(rankConflicts(conflictState)),

  listKnowledgeGaps: async () =>
    (await workspaceOverride())
      ? respond([], LATENCY.fast)
      : respond(rankGaps(gapState)),

  resolveKnowledgeConflict: ({ conflictId, sourceId }) =>
    respond(resolveConflict(conflictId, sourceId), LATENCY.normal),

  answerKnowledgeGap: ({ gapId, answer }) =>
    respond(answerGap(gapId, answer), LATENCY.normal),

  // A workspace onboarded this morning has rehearsed nothing, and its suites
  // are not Northgate's: scenarios are seeded from calls that actually went
  // wrong, so a dental practice's are worthless to a hotel and lending them
  // would put a stranger's failures under someone else's draft. The Simulator
  // renders the day-one empty state instead, which is the honest picture.
  listScenarioSuites: async () =>
    (await workspaceOverride())
      ? respond([], LATENCY.fast)
      : respond(fx.scenarioSuites),

  listScenarios: async () =>
    (await workspaceOverride())
      ? respond([], LATENCY.fast)
      : respond(fx.scenarios),

  listSimulationRuns: async () =>
    (await workspaceOverride())
      ? respond([], LATENCY.fast)
      : respond(
          [...runState].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
        ),

  startSimulationRun: (input) => respond(startRun(input), LATENCY.fast),

  getSimulationRun: (id) =>
    respond(runState.find((run) => run.id === id) ?? null, LATENCY.fast),

  listReleases: async (employeeId) => {
    // A workspace onboarded this morning has published nothing, and showing it
    // Northgate's release history would put another tenant's changes under a
    // rollback control. Ordering is left to `domain/releases.ts`, which
    // partitions drafts from history rather than ranking them together.
    if (await workspaceOverride()) return respond([], LATENCY.fast);

    return respond(
      employeeId
        ? releaseState.filter((r) => r.employeeId === employeeId)
        : releaseState,
    );
  },

  /**
   * The gate is re-checked here rather than trusted from the screen. A mock
   * that accepts whatever the UI sends teaches the UI nothing — and these are
   * exactly the rules a real endpoint would have to enforce anyway, because
   * the findings can change between the screen loading and publish being
   * pressed.
   */
  publishRelease: async ({ releaseId, note, acknowledgedFindingIds }) => {
    const release = requireRelease(releaseId);
    if (release.state !== "draft") {
      throw new Error("Only a draft can be published.");
    }
    if (!note.trim()) {
      throw new Error("A change note is required to publish.");
    }

    // Read from the same session-lived state the Simulator writes to, not the
    // authored fixtures: a suite run a minute ago is exactly the evidence
    // somebody is publishing on, and a gate that could not see it would reject
    // a draft the screen had just shown as clear.
    const versionId =
      employeeState.find((e) => e.id === release.employeeId)?.draftVersion?.id ??
      null;
    const gate = gateForVersion(versionId, runState, fx.scenarios);

    if (!gate) {
      throw new Error(
        "This version has not been simulated. Run a suite against it before publishing.",
      );
    }

    const unacknowledged = gate.findings.filter(
      (finding) => !acknowledgedFindingIds.includes(finding.id),
    );
    if (unacknowledged.length > 0) {
      throw new Error(
        `Unresolved simulation findings must be acknowledged before publishing: ${unacknowledged
          .map((finding) => finding.scenarioName)
          .join(", ")}.`,
      );
    }

    release.state = "published";
    release.publishedAt = new Date(now()).toISOString();
    release.publishedByUserId = currentPerson().id;
    release.note = note.trim();
    // The run that gated it — the most recent one against the version.
    release.simulationRunId =
      [...gate.runs].sort((a, b) =>
        b.startedAt.localeCompare(a.startedAt),
      )[0]?.id ?? null;

    return respond(release, LATENCY.slow);
  },

  rollbackRelease: async ({ releaseId, reason }) => {
    const release = requireRelease(releaseId);
    if (release.state !== "published") {
      throw new Error("Only a published release can be rolled back.");
    }
    if (!reason.trim()) {
      throw new Error("A reason is required to roll back.");
    }

    release.state = "rolled_back";
    release.rolledBackAt = new Date(now()).toISOString();
    release.rolledBackReason = reason.trim();

    return respond(release, LATENCY.slow);
  },

  // Same rule as the roster above: a fresh workspace has provisioned nothing.
  listPhoneNumbers: async () =>
    (await workspaceOverride())
      ? respond([], LATENCY.fast)
      : respond(fx.phoneNumbers),

  setDeploymentFallback: ({ deploymentId, fallback }) =>
    respond(setFallback(deploymentId, fallback), LATENCY.fast),
  listComplianceGates: () => respond(fx.complianceGates),
  listRetentionPolicies: () => respond(fx.retentionPolicies),
  // A workspace onboarded this morning has one member and no rota — the same
  // rule the rest of the identity-bearing endpoints follow.
  listOnCall: async () =>
    respond((await workspaceOverride()) ? [] : rotaState, LATENCY.fast),

  assignRole: async ({ userId, role }) => {
    const user = requireUser(userId);

    // Two refusals, both of which exist because the alternative is a workspace
    // nobody can administer. Neither is a UI nicety: they are the reason this
    // operation is safe to expose at all.
    if (userId === currentPerson().id) {
      throw new Error(
        "You cannot change your own role. Ask another owner or governor to do it.",
      );
    }
    if (
      isOwner(user) &&
      role !== "owner" &&
      peopleState.filter(isOwner).length === 1
    ) {
      throw new Error(
        "This is the last owner. Make someone else an owner first, or the workspace is left with nobody who can grant anything.",
      );
    }

    // A preset *is* its capability set — see `RoleAssignment` in the contract.
    // Assigning one therefore replaces the grant rather than merging into it,
    // which is also what clears any drift the previous set had accumulated.
    user.role = role;
    user.capabilities = [...ROLE_CAPABILITIES[role]];

    return respond(user, LATENCY.fast);
  },

  setOnCallPrimary: async (userId) => {
    // Throws on an unknown id rather than quietly rostering a ghost.
    requireUser(userId);

    for (const entry of rotaState) entry.isPrimary = entry.userId === userId;

    // Someone can be handed the pager without already being on the rota. They
    // join the window that is running now rather than inventing one, so the
    // handover cannot silently extend cover past when it was agreed to end.
    if (!rotaState.some((entry) => entry.userId === userId)) {
      const window = rotaState[0];
      rotaState.push({
        id: `oc_${userId}`,
        userId,
        startsAt: window?.startsAt ?? new Date(now()).toISOString(),
        endsAt: window?.endsAt ?? new Date(now()).toISOString(),
        isPrimary: true,
      });
    }

    // `User.onCall` is the badge the rest of the shell paints from, so it has
    // to follow the rota rather than drift from it. The rota stays the thing
    // with a start and an end; the flag is only ever derived from it.
    const primaryIds = new Set(
      rotaState.filter((entry) => entry.isPrimary).map((entry) => entry.userId),
    );
    for (const person of peopleState) person.onCall = primaryIds.has(person.id);

    return respond(rotaState, LATENCY.fast);
  },

  getPerformance: async (filters = {}) => {
    const range = filters.range ?? "7d";
    const days = range === "7d" ? 7 : 30;

    // A real onboarded tenant has days of history at most, and none of it is
    // Northgate's. Empty is the honest answer — see rule 12.
    if (await workspaceOverride()) {
      return respond(
        {
          range,
          points: [],
          previousPoints: [],
          blockerBreakdown: [],
          procedureHealth: [],
        },
        LATENCY.slow,
      );
    }

    const siteShare = filters.scope?.locationId
      ? (fx.sitePerformanceShare[filters.scope.locationId] ?? 0)
      : 1;

    const series = fx.performanceSeries.map((point) =>
      siteSlice(point, siteShare),
    );
    const points = series.slice(-days);
    const previousPoints = series.slice(-days * 2, -days);
    const escalated = points.reduce((n, p) => n + p.escalated, 0);

    return respond(
      {
        range,
        points,
        previousPoints,
        blockerBreakdown: splitByMix(escalated, fx.blockerMix),
        procedureHealth: fx.procedureHealthProfile.map((p) => ({
          procedureId: p.procedureId,
          name: p.name,
          runs: Math.round(p.runsPerDay * days * siteShare),
          completionRate: p.completionRate,
          trend: p.trend,
        })),
      },
      LATENCY.slow,
    );
  },

  getReviewIssue: (id) =>
    respond(fx.reviewIssues.find((i) => i.id === id) ?? null),
};
