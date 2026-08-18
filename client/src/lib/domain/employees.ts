/**
 * AI employee logic that is not a screen.
 *
 * Two things live here that the roster, the detail screen and — later — the
 * release diff all have to agree about.
 *
 * **The capability catalogue.** `CapabilityId` is a set of internal tokens, and
 * half of them contain a domain noun: `book_visit` is "Book an appointment" in
 * a clinic and "Book a reservation" in a hotel. So capability copy is a
 * function of the lexicon (rule 1), and it lives beside the model rather than
 * in `labels.ts` — that file is explicitly for enums that read the same in
 * every industry, and these do not.
 *
 * **The reading order of the authority matrix.** An owner reviewing an AI
 * employee before it answers a phone is asking one question: *what happens
 * without me?* So the matrix is banded by that answer — does it alone, asks
 * first, drafts for a person, never — rather than listed alphabetically or in
 * whatever order the grants arrived in. The bands are derived here so the
 * roster's one-line summary and the detail screen's full matrix cannot
 * disagree about which band a capability falls in.
 */

import { lower, withArticle, type Lexicon } from "@/lib/lexicon";
import type { Tone } from "@/components/primitives/status";
import { money } from "@/lib/utils/time";
import type {
  AIEmployee,
  AutonomyLevel,
  CapabilityGrant,
  CapabilityId,
  CapabilityLimits,
  EmployeeVersion,
  KnowledgeSource,
  Procedure,
  Tool,
} from "./types";

/** Copy that needs a domain noun takes the lexicon; the rest is plain English. */
type Copy = string | ((lex: Lexicon) => string);

export function resolveCopy(copy: Copy, lexicon: Lexicon): string {
  return typeof copy === "function" ? copy(lexicon) : copy;
}

// ─────────────────────────────────────────────────────────────────────────────
// The capability catalogue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Grouping exists to order rows *within* an authority band, so a band always
 * reads talking → scheduling → records → restricted rather than reshuffling as
 * autonomy changes. It is deliberately not the top-level grouping: "what can it
 * do without me" is the question, and a group heading would answer a different
 * one.
 */
export type CapabilityGroupId = "talking" | "scheduling" | "records" | "restricted";

export type AiCapabilityDefinition = {
  id: CapabilityId;
  group: CapabilityGroupId;
  /** What it does, as the act itself rather than the permission name. */
  label: Copy;
  /** The consequence an owner weighs before letting it happen unsupervised. */
  detail: Copy;
  /**
   * Capabilities a business owner cannot switch on alone, per §3.11. Marked on
   * the catalogue rather than only on a grant because it is a fact about the
   * capability and the law around it, not about one employee's configuration —
   * so it can still be stated for an employee that was never granted it at
   * all. A grant carrying its own `hardBlockReason` is more specific and wins.
   */
  restricted?: true;
  restrictionReason?: Copy;
};

/**
 * Every capability the model defines, in reading order.
 *
 * `clinical_advice` is the one id whose token is narrower than the thing it
 * names: §3.11 lists clinical, legal and financial advice as one class of hard
 * block, and the label says so. Branching that copy on the workspace's
 * regulatory profile would be an industry conditional in all but name; naming
 * the whole class reads correctly in a clinic, a law firm and a broker alike.
 */
export const AI_CAPABILITIES: AiCapabilityDefinition[] = [
  {
    id: "answer_from_knowledge",
    group: "talking",
    label: "Answer questions",
    detail:
      "Says only what an approved source supports. Anything else, it says it does not know rather than guessing.",
  },
  {
    id: "verify_identity",
    group: "talking",
    label: "Check who is calling",
    detail: (lex) =>
      `Matches the caller to an existing ${lower(lex.party.one)} before anything is read out or changed.`,
  },
  {
    id: "collect_intake",
    group: "talking",
    label: "Take down details",
    detail: (lex) =>
      `Collects what the ${lower(lex.procedure.one)} asks for — reason for calling, contact details, anything the business needs before it can help.`,
  },
  {
    id: "transfer_call",
    group: "talking",
    label: "Put the caller through",
    detail:
      "Hands the live call to a person, rather than promising a callback and ending it.",
  },
  {
    id: "book_visit",
    group: "scheduling",
    label: (lex) => `Book ${withArticle(lex.visit.one)}`,
    detail:
      "Takes a real slot out of the diary. One booked in error costs someone a journey they did not need to make.",
  },
  {
    id: "reschedule_visit",
    group: "scheduling",
    label: (lex) => `Move ${withArticle(lex.visit.one)}`,
    detail: (lex) =>
      `Changes ${withArticle(lex.visit.one)} that already exists, freeing the slot it was in for somebody else.`,
  },
  {
    id: "cancel_visit",
    group: "scheduling",
    label: (lex) => `Cancel ${withArticle(lex.visit.one)}`,
    detail:
      "Irreversible from the caller's side, and the slot may be gone by the time anyone notices a mistake.",
  },
  {
    id: "send_confirmation",
    group: "records",
    label: "Send a confirmation",
    detail:
      "Texts or emails what was agreed, so the caller has it in writing and the business has a record of what was said.",
  },
  {
    id: "create_case",
    group: "records",
    label: (lex) => `Open ${withArticle(lex.case.one)}`,
    detail: (lex) =>
      `Raises ${withArticle(lex.case.one)} for someone to pick up, with the call attached as its evidence.`,
  },
  {
    id: "update_party_record",
    group: "records",
    label: (lex) => `Change ${withArticle(lex.party.one)}'s record`,
    detail:
      "Writes to the record itself. Anything the AI worked out on its own stays marked as unconfirmed until a person signs it off.",
  },
  {
    id: "take_payment",
    group: "restricted",
    label: "Take a payment",
    detail:
      "Reading card details aloud to any system, human or otherwise, is what card-industry rules exist to prevent.",
    restricted: true,
    restrictionReason:
      "Card details are never captured by voice. This cannot be switched on from inside the workspace — a payment link or a transfer to a person is the supported route.",
  },
  {
    id: "clinical_advice",
    group: "restricted",
    label: "Give professional advice",
    detail:
      "Advice a qualified person is accountable for — clinical, legal or financial. Reading out an approved instruction is not the same thing and is covered by answering questions.",
    restricted: true,
    restrictionReason:
      "Advice a regulator holds a named professional responsible for cannot be delegated to an AI by a workspace administrator. Approved information is read out; anything past it goes to a person.",
  },
];

const BY_ID = new Map(AI_CAPABILITIES.map((capability) => [capability.id, capability]));

export function aiCapability(id: CapabilityId): AiCapabilityDefinition | null {
  return BY_ID.get(id) ?? null;
}

/**
 * A capability's name, with an unmapped id falling back to its token rather
 * than to nothing. A capability the catalogue has not caught up with must still
 * be visible on the matrix: silently dropping a row would answer "can it do
 * this?" with a blank space.
 */
export function capabilityLabel(id: CapabilityId, lexicon: Lexicon): string {
  const capability = BY_ID.get(id);
  return capability ? resolveCopy(capability.label, lexicon) : id;
}

export function capabilityDetail(id: CapabilityId, lexicon: Lexicon): string | null {
  const capability = BY_ID.get(id);
  return capability ? resolveCopy(capability.detail, lexicon) : null;
}

const GROUP_ORDER: CapabilityGroupId[] = [
  "talking",
  "scheduling",
  "records",
  "restricted",
];

const CATALOGUE_RANK = new Map(
  AI_CAPABILITIES.map((capability, index) => [capability.id, index]),
);

function rank(id: CapabilityId): number {
  return CATALOGUE_RANK.get(id) ?? AI_CAPABILITIES.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// The authority matrix
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A row on the matrix.
 *
 * Every catalogue capability produces one, granted or not. An authority review
 * that listed only what was granted could not answer "can it take card
 * details?" — and that unanswered question is the whole reason §3.11 insists
 * hard blocks are rendered rather than hidden. `grant` is null for a
 * capability this version was never given.
 */
export type AuthorityRow = {
  capabilityId: CapabilityId;
  grant: CapabilityGrant | null;
  /**
   * Present when the capability cannot be enabled from inside the workspace.
   * Left unresolved — a grant's own reason is authored prose, the catalogue's is
   * `Copy`, and both are resolved by whoever renders them.
   */
  blockReason: Copy | null;
};

export type AuthorityBandId =
  | "alone"
  | "asks"
  | "drafts"
  | "never"
  | "ungranted"
  | "blocked";

export type AuthorityBand = {
  id: AuthorityBandId;
  /** Answers "what happens without me", which is why it is a full sentence. */
  headline: string;
  detail: Copy;
  tone: Tone;
  rows: AuthorityRow[];
};

/**
 * `act` and `act_notify` share a band on purpose. The question the band answers
 * is "does this need me?", and for both the answer is no — the notification is
 * a courtesy after the fact, not a gate. The row's own autonomy label carries
 * the difference, so nothing is lost by not splitting the heading.
 */
const BAND_FOR_AUTONOMY: Record<AutonomyLevel, AuthorityBandId> = {
  act: "alone",
  act_notify: "alone",
  approve: "asks",
  suggest: "drafts",
  observe: "never",
};

const BAND_ORDER: {
  id: AuthorityBandId;
  headline: string;
  detail: Copy;
  tone: Tone;
}[] = [
  {
    id: "alone",
    headline: "Does these without asking",
    detail:
      "Inside the limits shown, and logged. This is the band to read twice — everything here happens while nobody is watching.",
    tone: "success",
  },
  {
    id: "asks",
    headline: "Asks a person first",
    detail:
      "The AI proposes; a named person decides. The caller waits, so an approval nobody answers becomes a bad call rather than a safe one.",
    tone: "warning",
  },
  {
    id: "drafts",
    headline: "Drafts these for a person",
    detail:
      "Prepared during the call and left for someone to send or confirm afterwards. Nothing reaches the customer unread.",
    tone: "info",
  },
  {
    id: "never",
    headline: "Never does these",
    detail:
      "Granted but held at observe: the AI may say the business does this, and will not attempt it.",
    tone: "neutral",
  },
  {
    id: "ungranted",
    headline: "Not part of its job",
    detail: (lex) =>
      `Never granted to this ${lower(lex.employee.one)}. It cannot do these and does not offer to — a caller asking is transferred or told to expect a callback.`,
    tone: "neutral",
  },
  {
    id: "blocked",
    headline: "Cannot be switched on here",
    detail:
      "Not a preference. These need a decision outside this workspace, and the reason is stated rather than left as a greyed-out control.",
    tone: "danger",
  },
];

/**
 * The matrix, banded and ordered.
 *
 * Empty bands are dropped: a heading over nothing reads as a loading failure.
 * A version with no grants at all still produces the ungranted and blocked
 * bands, which is the honest picture of an employee that has been named but
 * given no authority — the state every draft starts in.
 */
export function authorityBands(version: EmployeeVersion | null): AuthorityBand[] {
  const grants = new Map(
    (version?.authority ?? []).map((grant) => [grant.capabilityId, grant]),
  );

  const rows = new Map<AuthorityBandId, AuthorityRow[]>();
  const push = (band: AuthorityBandId, row: AuthorityRow) => {
    const list = rows.get(band) ?? [];
    list.push(row);
    rows.set(band, list);
  };

  for (const capability of AI_CAPABILITIES) {
    const grant = grants.get(capability.id) ?? null;

    // A hard block outranks whatever autonomy the grant carries: the level is
    // what someone tried to set, and the block is what actually happens.
    const blocked = grant?.hardBlocked || capability.restricted;
    if (blocked) {
      push("blocked", {
        capabilityId: capability.id,
        grant,
        // The grant's reason is authored for this employee and says more than
        // the catalogue's general one, so it wins where it exists.
        blockReason: grant?.hardBlockReason ?? capability.restrictionReason ?? null,
      });
      continue;
    }

    push(grant ? BAND_FOR_AUTONOMY[grant.autonomy] : "ungranted", {
      capabilityId: capability.id,
      grant,
      blockReason: null,
    });
  }

  // Any capability granted that the catalogue does not know about still gets a
  // row, in the band its autonomy puts it in.
  for (const grant of version?.authority ?? []) {
    if (BY_ID.has(grant.capabilityId)) continue;
    push(grant.hardBlocked ? "blocked" : BAND_FOR_AUTONOMY[grant.autonomy], {
      capabilityId: grant.capabilityId,
      grant,
      blockReason: grant.hardBlockReason,
    });
  }

  return BAND_ORDER.flatMap((band) => {
    const list = rows.get(band.id);
    if (!list?.length) return [];
    return [{ ...band, rows: [...list].sort(byGroupThenCatalogue) }];
  });
}

function byGroupThenCatalogue(a: AuthorityRow, b: AuthorityRow): number {
  const groupOf = (row: AuthorityRow) =>
    GROUP_ORDER.indexOf(BY_ID.get(row.capabilityId)?.group ?? "restricted");
  const byGroup = groupOf(a) - groupOf(b);
  if (byGroup !== 0) return byGroup;
  return rank(a.capabilityId) - rank(b.capabilityId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Summaries
// ─────────────────────────────────────────────────────────────────────────────

export type AuthorityTally = {
  alone: number;
  asks: number;
  drafts: number;
  never: number;
  ungranted: number;
  blocked: number;
  /** Granted anything at all — the difference between a draft and a job. */
  granted: number;
};

export function authorityTally(version: EmployeeVersion | null): AuthorityTally {
  const counts: AuthorityTally = {
    alone: 0,
    asks: 0,
    drafts: 0,
    never: 0,
    ungranted: 0,
    blocked: 0,
    granted: version?.authority.length ?? 0,
  };

  for (const band of authorityBands(version)) {
    counts[band.id] = band.rows.length;
  }

  return counts;
}

/**
 * The roster's one line about authority, phrased as consequences rather than as
 * a count of grants. "Does 8 without asking" is a fact about the business;
 * "8 capabilities at act" is a fact about a data model.
 */
export function summariseAuthority(version: EmployeeVersion | null): string | null {
  const tally = authorityTally(version);
  if (tally.granted === 0) return null;

  const parts: string[] = [];
  if (tally.alone) parts.push(`does ${tally.alone} without asking`);
  if (tally.asks) parts.push(`asks first for ${tally.asks}`);
  if (tally.drafts) parts.push(`drafts ${tally.drafts}`);
  if (tally.never) parts.push(`holds ${tally.never} at never`);

  const sentence = parts.join(" · ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * Limits as the sentences a person would say them in, not as fields.
 *
 * An empty array means genuinely unlimited, which the screen has to state
 * outright — a row with a blank limits column reads as "not loaded yet", and
 * "no cap on how often it does this" is exactly the kind of thing an authority
 * review exists to catch.
 */
export function describeLimits(
  limits: CapabilityLimits,
  currency = "GBP",
): string[] {
  const parts: string[] = [];

  if (limits.perCall !== null) {
    parts.push(
      limits.perCall === 1 ? "Once per call" : `Up to ${limits.perCall} per call`,
    );
  }
  if (limits.perDay !== null) {
    parts.push(`Up to ${limits.perDay} a day`);
  }
  if (limits.valueCap !== null) {
    parts.push(`Up to ${money(limits.valueCap, currency)}`);
  }
  if (limits.requiresVerifiedIdentity) {
    parts.push("Only once the caller is identified");
  }

  return parts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading an employee
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The version a caller is actually talking to, falling back to the draft.
 *
 * Live first is not a preference: an employee with both a live and a draft
 * version is answering the phone with the live one, and a screen that showed
 * the draft's authority under the word Live would misreport what the business
 * is currently doing.
 */
export function activeVersion(employee: AIEmployee): EmployeeVersion | null {
  return employee.liveVersion ?? employee.draftVersion ?? null;
}

/** The name a person uses for this employee, wherever it is configured. */
export function employeeName(employee: AIEmployee): string | null {
  return activeVersion(employee)?.persona.name ?? null;
}

export function employeeRole(employee: AIEmployee): string | null {
  return activeVersion(employee)?.persona.role ?? null;
}

/**
 * Whether the draft differs from what is live in a way worth surfacing.
 *
 * Deliberately a shallow structural comparison rather than a diff: the diff a
 * publisher reads is authored on the release (`Release.changes`), and inventing
 * a second, derived one here would give the roster and the release history two
 * different accounts of the same change. This only answers "is there anything
 * to look at", which the roster needs and the release cannot answer for an
 * employee whose draft has no release record yet.
 */
export function draftDiffers(employee: AIEmployee): boolean {
  const { liveVersion: live, draftVersion: draft } = employee;
  if (!draft) return false;
  if (!live) return true;

  return (
    JSON.stringify(live.persona) !== JSON.stringify(draft.persona) ||
    JSON.stringify(live.grants) !== JSON.stringify(draft.grants) ||
    JSON.stringify(live.authority) !== JSON.stringify(draft.authority) ||
    JSON.stringify(live.escalationTriggers) !==
      JSON.stringify(draft.escalationTriggers)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Grants — the workspace assets an employee has been lent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Grants resolved to the things they point at.
 *
 * Employees are granted workspace assets and never own them (§3.1), so a grant
 * is a list of ids and the assets live elsewhere. Resolving them here rather
 * than in the screen keeps one answer to "what has this employee been given",
 * and keeps the screen from having to know that a knowledge grant is by
 * *collection* while the thing worth naming is the source inside it.
 */
export type GrantedAssets = {
  knowledge: KnowledgeSource[];
  procedures: Procedure[];
  tools: Tool[];
  /**
   * Policies have no entity behind them yet — nothing lists, names or renders
   * one. The ids come through untouched so the screen can say how many there
   * are without implying a surface that does not exist.
   */
  policyIds: string[];
  /** Ids granted that resolve to nothing, which is a misconfiguration. */
  missing: number;
};

export function grantedAssets(
  version: EmployeeVersion | null,
  catalogue: {
    knowledge: KnowledgeSource[];
    procedures: Procedure[];
    tools: Tool[];
  },
): GrantedAssets {
  const grants = version?.grants;
  if (!grants) {
    return {
      knowledge: [],
      procedures: [],
      tools: [],
      policyIds: [],
      missing: 0,
    };
  }

  const knowledge = catalogue.knowledge.filter((source) =>
    grants.knowledgeCollectionIds.includes(source.collectionId),
  );
  const procedures = catalogue.procedures.filter((procedure) =>
    grants.procedureIds.includes(procedure.id),
  );
  const tools = catalogue.tools.filter((tool) => grants.toolIds.includes(tool.id));

  // A granted collection with no source in it, or a tool id nothing exposes,
  // is a grant pointing at something that has been deleted or renamed. The
  // count is surfaced rather than swallowed: the AI is configured to use
  // something that is not there.
  const liveCollections = new Set(catalogue.knowledge.map((s) => s.collectionId));
  const missing =
    grants.knowledgeCollectionIds.filter((id) => !liveCollections.has(id)).length +
    (grants.procedureIds.length - procedures.length) +
    (grants.toolIds.length - tools.length);

  return {
    knowledge,
    procedures,
    tools,
    policyIds: grants.policyIds,
    missing,
  };
}

/**
 * Roster order: live employees first, then by name.
 *
 * Status order rather than creation order, because the roster's job is "what is
 * answering my phones" — and a paused employee sitting above a live one is a
 * list ordered by an implementation detail.
 */
const STATUS_RANK: Record<AIEmployee["status"], number> = {
  live: 0,
  degraded: 1,
  paused: 2,
  scheduled: 3,
  draft: 4,
};

export function sortRoster(employees: AIEmployee[]): AIEmployee[] {
  return [...employees].sort((a, b) => {
    const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (byStatus !== 0) return byStatus;
    return (employeeName(a) ?? "").localeCompare(employeeName(b) ?? "");
  });
}
