/**
 * People logic that is not a screen.
 *
 * The governing idea, and the reason this file exists at all: **a role is a
 * summary, a capability is the fact.** Rule 6 says autonomy is granted per
 * capability rather than per AI employee; the same is true of the people
 * supervising them. "Operator" is a convenient way to hand out ten permissions
 * at once, not a thing the system actually checks — every gate in the shell
 * checks a capability string (`navigation.ts#hasCapability`).
 *
 * So the preset sets below are the *intent*, and a person's own `capabilities`
 * array is the *truth*. Where they disagree, the disagreement is the finding —
 * see `roleDrift`. A screen that showed only the role badge would confidently
 * report that Saoirse is an Operator while she is, in fact, missing half of
 * what the escalation path assumes she can do.
 */

import type { Lexicon } from "@/lib/lexicon";
import { hasCapability } from "@/lib/navigation";
import type { OnCallEntry, RolePreset, User } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// The capability catalogue
// ─────────────────────────────────────────────────────────────────────────────

export type CapabilityAreaId = "live" | "records" | "build" | "govern";

/**
 * Copy that may need a domain noun takes the lexicon, exactly as a nav label
 * does (`navigation.ts#resolveLabel`). Everything else is plain interface
 * English — "Approve what the AI asks for" reads the same in a clinic and a
 * law firm, and mapping it through the lexicon would be busywork.
 */
type Copy = string | ((lex: Lexicon) => string);

export function resolveCopy(copy: Copy, lexicon: Lexicon): string {
  return typeof copy === "function" ? copy(lexicon) : copy;
}

export type CapabilityArea = {
  id: CapabilityAreaId;
  label: string;
  /** Why this group of permissions hangs together. */
  description: Copy;
};

export const CAPABILITY_AREAS: CapabilityArea[] = [
  {
    id: "live",
    label: "Live work",
    description: (lex) =>
      `Watching, joining and ending ${lex.conversation.many.toLowerCase()} while they are happening.`,
  },
  {
    id: "records",
    label: "People and records",
    description: (lex) =>
      `Reading and correcting what the business holds about a ${lex.party.one.toLowerCase()}.`,
  },
  {
    id: "build",
    label: "Changing the AI",
    description: (lex) =>
      `Editing what the ${lex.employee.one.toLowerCase()} knows and does, and putting the change live.`,
  },
  {
    id: "govern",
    label: "Control and accountability",
    description:
      "The permissions that decide who is answerable for the rest of them.",
  },
];

export type CapabilityDefinition = {
  id: string;
  area: CapabilityAreaId;
  /** What the person can do, phrased as the act rather than the permission. */
  label: Copy;
  /** The consequence a governor needs to weigh before granting it. */
  detail: Copy;
  /**
   * Grants that expose personal data or change what customers are told, and so
   * deserve a second look on a screen full of tick marks.
   */
  sensitive?: boolean;
};

export const CAPABILITIES: CapabilityDefinition[] = [
  // ── Live work
  {
    id: "conversation.read",
    area: "live",
    label: (lex) => `Read ${lex.conversation.many.toLowerCase()}`,
    detail: (lex) =>
      `Open live and finished ${lex.conversation.many.toLowerCase()}, including the full transcript and every action the AI took.`,
  },
  {
    id: "conversation.coach",
    area: "live",
    label: "Coach without joining",
    detail: (lex) =>
      `Send private guidance the AI follows while the ${lex.conversation.one.toLowerCase()} is still running. The caller hears nothing.`,
  },
  {
    id: "conversation.takeover",
    area: "live",
    label: "Take control",
    detail: (lex) =>
      `Take the ${lex.conversation.one.toLowerCase()} off the AI and speak to the caller directly. This is what an escalation actually needs.`,
  },
  {
    id: "conversation.transfer",
    area: "live",
    label: "Transfer to someone else",
    detail: (lex) =>
      `Hand a ${lex.conversation.one.toLowerCase()} to another person, another ${lex.department.one.toLowerCase()}, or an outside number.`,
  },
  {
    id: "approval.grant",
    area: "live",
    label: "Approve what the AI asks for",
    detail:
      "Answer the interrupts raised by any capability set to ask a person first. A live caller is waiting while it is unanswered.",
  },
  {
    id: "recording.listen",
    area: "live",
    label: "Play recordings",
    detail:
      "Listen back to call audio. Every playback is itself written to the audit log, including this one.",
    sensitive: true,
  },

  // ── People and records
  {
    id: "record.read",
    area: "records",
    label: (lex) => `Open ${lex.party.one.toLowerCase()} records`,
    detail: (lex) =>
      `See a ${lex.party.one.toLowerCase()}'s history, consent answers, and the ${lex.visit.many.toLowerCase()} behind them.`,
  },
  {
    id: "record.edit",
    area: "records",
    label: "Confirm and correct records",
    detail: (lex) =>
      `Turn something the AI worked out on its own into a verified fact, or correct it. Nothing else can promote an inferred fact about a ${lex.party.one.toLowerCase()}.`,
  },
  {
    id: "pii.reveal",
    area: "records",
    label: "Reveal hidden details",
    detail:
      "Unmask contact details and identifiers that are redacted by default. Each reveal is logged against the person who asked for it.",
    sensitive: true,
  },

  // ── Changing the AI
  {
    id: "employee.read",
    area: "build",
    label: (lex) => `See how the ${lex.employee.one.toLowerCase()} is set up`,
    detail:
      "Read the persona, the authority levels and the release history without being able to change any of them.",
  },
  {
    id: "employee.edit",
    area: "build",
    label: "Edit the draft",
    detail:
      "Change persona, authority and grants in the draft version. Drafts do not affect live calls until they are published.",
  },
  {
    id: "employee.publish",
    area: "build",
    label: "Publish a version",
    detail:
      "Put a draft in front of real callers, and roll one back. The single most consequential permission in Build.",
    sensitive: true,
  },
  {
    id: "knowledge.read",
    area: "build",
    label: "Read the knowledge base",
    detail: "See every approved answer, its source, and when it was last checked.",
  },
  {
    id: "knowledge.edit",
    area: "build",
    label: "Approve answers",
    detail:
      "Add, correct and retire the answers the AI is allowed to give. An unapproved answer is one the AI will decline to give at all.",
  },
  {
    id: "procedure.read",
    area: "build",
    label: (lex) => `Read ${lex.procedure.many.toLowerCase()}`,
    detail: (lex) =>
      `Follow, step by step, what the AI does in a given situation — the ${lex.procedure.many.toLowerCase()} without the ability to change them.`,
  },
  {
    id: "procedure.edit",
    area: "build",
    label: (lex) => `Change ${lex.procedure.many.toLowerCase()}`,
    detail: (lex) =>
      `Edit the steps the AI works through, including which of them require a person. Takes effect when the ${lex.employee.one.toLowerCase()} is next published.`,
  },
  {
    id: "tool.read",
    area: "build",
    label: "See connected systems",
    detail:
      "Check what is connected, what it is allowed to do, and whether it is currently responding.",
  },
  {
    id: "tool.configure",
    area: "build",
    label: "Connect and configure systems",
    detail:
      "Connect a calendar, records system or payment provider, and set the scopes it is granted. This is how the AI gains the ability to act in the real world.",
    sensitive: true,
  },
  {
    id: "simulation.run",
    area: "build",
    label: "Run simulations",
    detail:
      "Test a draft against scenario suites before it reaches anyone. Costs model spend but touches no real caller.",
  },
  {
    id: "issue.read",
    area: "build",
    label: "See the review queue",
    detail:
      "Read what the AI could not handle and why, grouped by cause rather than by incident.",
  },
  {
    id: "issue.resolve",
    area: "build",
    label: "Resolve and dismiss issues",
    detail:
      "Close a cause in the review queue, or dismiss it as not worth fixing. Dismissing it stops it being counted.",
  },

  // ── Control and accountability
  {
    id: "people.manage",
    area: "govern",
    label: "Manage people and roles",
    detail:
      "Grant and remove everything on this list, and decide who receives an escalation. Includes the ability to grant this permission itself.",
    sensitive: true,
  },
  {
    id: "audit.read",
    area: "govern",
    label: "Read the audit log",
    detail:
      "Reconstruct what any person or the AI did, in order, including who listened to which recording.",
  },
  {
    id: "compliance.read",
    area: "govern",
    label: "See compliance gates",
    detail:
      "Check consent, recording law by jurisdiction and the gates that block a deployment.",
  },
  {
    id: "retention.manage",
    area: "govern",
    label: "Set retention",
    detail:
      "Decide how long recordings, transcripts and records are kept. Shortening a period deletes data, permanently, on the schedule it sets.",
    sensitive: true,
  },
  {
    id: "channel.manage",
    area: "govern",
    label: "Manage numbers and hours",
    detail:
      "Buy and assign phone numbers, set operating hours, and choose what a caller hears when the AI is paused or out of hours.",
  },
  {
    id: "workspace.manage",
    area: "govern",
    label: "Manage the workspace",
    detail: (lex) =>
      `Rename the business, add a ${lex.location.one.toLowerCase()}, and change the words this interface uses for everything.`,
  },
  {
    id: "billing.read",
    area: "govern",
    label: "See spend and billing",
    detail:
      "Read spend against budget and cost per resolution, and set what happens when the cap is reached.",
  },
];

const CAPABILITY_BY_ID = new Map(CAPABILITIES.map((c) => [c.id, c]));

export function capabilityById(id: string): CapabilityDefinition | null {
  return CAPABILITY_BY_ID.get(id) ?? null;
}

/** Catalogue order, grouped. Unknown ids are dropped rather than guessed at. */
export function groupCapabilities(
  ids: string[],
): { area: CapabilityArea; capabilities: CapabilityDefinition[] }[] {
  const held = new Set(ids);
  return CAPABILITY_AREAS.map((area) => ({
    area,
    capabilities: CAPABILITIES.filter(
      (capability) => capability.area === area.id && held.has(capability.id),
    ),
  })).filter((group) => group.capabilities.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Role presets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What each preset grants.
 *
 * Owner is the wildcard, and it is the only one: `hasCapability` treats "*" as
 * everything, so an owner also holds any capability added after they were set
 * up. The other three are enumerated deliberately — a preset that quietly grew
 * a permission on upgrade would be a governance failure, not a convenience.
 *
 * The shapes: an Operator runs today's calls but cannot change the AI. A
 * Builder changes the AI and can read the evidence for a change, but cannot
 * take a live call or see personal data. A Governor is answerable for the
 * whole thing and so can see everything and grant anything, but deliberately
 * cannot edit or publish the AI — the person who audits a change should not
 * be the person who made it.
 */
export const ROLE_CAPABILITIES: Record<RolePreset, string[]> = {
  owner: ["*"],
  operator: [
    "conversation.read",
    "conversation.takeover",
    "conversation.coach",
    "conversation.transfer",
    "recording.listen",
    "record.read",
    "record.edit",
    "issue.read",
    "issue.resolve",
    "approval.grant",
  ],
  builder: [
    // Builders read conversations because that is where the evidence for a
    // change lives — you cannot fix a procedure you are not allowed to read
    // the failures of. They cannot join one.
    "conversation.read",
    "employee.read",
    "employee.edit",
    "employee.publish",
    "knowledge.read",
    "knowledge.edit",
    "procedure.read",
    "procedure.edit",
    "tool.read",
    "tool.configure",
    "simulation.run",
    "issue.read",
    "issue.resolve",
  ],
  governor: [
    "conversation.read",
    "audit.read",
    "compliance.read",
    "retention.manage",
    "people.manage",
    "recording.listen",
    "pii.reveal",
    "workspace.manage",
    "billing.read",
    "channel.manage",
  ],
};

export const ROLE_PRESETS: RolePreset[] = [
  "owner",
  "operator",
  "builder",
  "governor",
];

/**
 * Role copy lives here rather than in `labels.ts` because a preset's name, its
 * one-line job and its capability set are one authored unit: changing what
 * Governor grants without changing what Governor is *said* to be is how a
 * permissions screen starts lying. Keeping the three within a screen's height
 * of each other makes that mistake visible in review.
 */
export const ROLE_LABEL: Record<RolePreset, string> = {
  owner: "Owner",
  operator: "Operator",
  builder: "Builder",
  governor: "Governor",
};

/** What the role is for, in the terms of the person doing the assigning. */
export const ROLE_PURPOSE: Record<RolePreset, string> = {
  owner:
    "Runs the business. Holds everything, including any permission added later.",
  operator:
    "Runs today. Watches live work, takes over when the AI cannot cope, and fixes records — but cannot change what the AI does.",
  builder:
    "Changes what the AI knows and does, and publishes it. Reads the evidence for a change without being able to join a live call or see personal details.",
  governor:
    "Answerable for the whole thing. Sees everything and grants anything, but deliberately cannot edit or publish the AI — whoever audits a change should not be whoever made it.",
};

export function isOwner(user: User): boolean {
  return user.capabilities.includes("*");
}

export function holds(user: User, capability: string): boolean {
  return hasCapability(user.capabilities, capability);
}

/** How many of the catalogue's capabilities a person actually holds. */
export function heldCount(user: User): number {
  return isOwner(user)
    ? CAPABILITIES.length
    : CAPABILITIES.filter((capability) => user.capabilities.includes(capability.id))
        .length;
}

export type RoleDrift = {
  /** Held, but not part of the preset. Someone granted this by hand. */
  extra: string[];
  /** In the preset, but not held. The badge is over-promising. */
  missing: string[];
};

/**
 * Where the badge and the grant disagree.
 *
 * This is the whole reason the screen lists capabilities rather than roles: a
 * row reading "Operator" beside a rota entry reading "backup" implies someone
 * who can take a call at 19:40. Only the grant says whether that is true.
 */
export function roleDrift(user: User): RoleDrift {
  if (isOwner(user)) return { extra: [], missing: [] };

  const preset = new Set(ROLE_CAPABILITIES[user.role]);
  const held = new Set(user.capabilities);

  return {
    extra: [...held].filter((id) => !preset.has(id) && CAPABILITY_BY_ID.has(id)),
    missing: [...preset].filter((id) => !held.has(id)),
  };
}

export function hasDrift(drift: RoleDrift): boolean {
  return drift.extra.length > 0 || drift.missing.length > 0;
}

export type PresetDelta = {
  /** Capabilities the preset would add to what they hold today. */
  gains: CapabilityDefinition[];
  /** Capabilities they hold today that the preset would take away. */
  loses: CapabilityDefinition[];
  /** True when the target is owner: the wildcard, and everything added later. */
  becomesOwner: boolean;
  /** True when they are an owner today and would stop being one. */
  losesOwnership: boolean;
};

/**
 * What assigning a preset would actually change for this person.
 *
 * Computed against what they hold *now* rather than against their current
 * preset, because the two are frequently not the same thing — that is what
 * `roleDrift` reports. Someone badged Operator while missing half the set gains
 * five capabilities from being re-assigned Operator, and a confirmation step
 * that said "no change" would be wrong in exactly the case the person is most
 * likely to be acting on.
 */
export function presetDelta(user: User, role: RolePreset): PresetDelta {
  const wasOwner = isOwner(user);
  const becomesOwner = role === "owner";

  // Owner is the wildcard, so its effective set is the whole catalogue — the
  // same resolution `hasCapability` performs.
  const target = new Set(
    becomesOwner ? CAPABILITIES.map((c) => c.id) : ROLE_CAPABILITIES[role],
  );
  const held = new Set(
    wasOwner ? CAPABILITIES.map((c) => c.id) : user.capabilities,
  );

  return {
    gains: CAPABILITIES.filter((c) => target.has(c.id) && !held.has(c.id)),
    loses: CAPABILITIES.filter((c) => held.has(c.id) && !target.has(c.id)),
    becomesOwner: becomesOwner && !wasOwner,
    losesOwnership: wasOwner && !becomesOwner,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The escalation path
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What receiving an escalation actually requires.
 *
 * Being on the rota is an intention; these two are the mechanism. Someone
 * rostered without `conversation.takeover` will be handed a call they cannot
 * answer, and the caller will hear the silence rather than the org chart.
 */
export const ESCALATION_CAPABILITIES = [
  "conversation.read",
  "conversation.takeover",
] as const;

export function escalationGaps(user: User): CapabilityDefinition[] {
  return ESCALATION_CAPABILITIES.filter((id) => !holds(user, id))
    .map((id) => capabilityById(id))
    .filter((c): c is CapabilityDefinition => c !== null);
}

export type Cover = {
  primary: OnCallEntry | null;
  backups: OnCallEntry[];
  /** When the current cover lapses. Null when nobody is covering now. */
  endsAt: string | null;
  /** The next window that starts after this one, if the rota has been set. */
  next: OnCallEntry | null;
};

/**
 * Who answers, right now.
 *
 * Deliberately computed from the rota rather than from `User.onCall`: the flag
 * is a convenience for painting a badge, and the rota is the thing with a start
 * and an end. A screen that read the flag would be unable to answer the only
 * question that matters here — *and for how much longer?*
 */
export function resolveCover(entries: OnCallEntry[], atMs: number): Cover {
  const current = entries.filter(
    (entry) =>
      new Date(entry.startsAt).getTime() <= atMs &&
      new Date(entry.endsAt).getTime() > atMs,
  );

  const primary = current.find((entry) => entry.isPrimary) ?? null;
  const backups = current.filter((entry) => !entry.isPrimary);

  // The cover lapses when the last person currently rostered drops off, not
  // when the first does — a backup still there at 18:00 is still cover.
  const endsAt =
    current.length > 0
      ? current.reduce(
          (latest, entry) => (entry.endsAt > latest ? entry.endsAt : latest),
          current[0].endsAt,
        )
      : null;

  const next =
    entries
      .filter((entry) => new Date(entry.startsAt).getTime() > atMs)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;

  return { primary, backups, endsAt, next };
}

/** True when cover runs out with nothing rostered to follow it. */
export function hasCoverageGap(cover: Cover): boolean {
  if (!cover.endsAt) return true;
  if (!cover.next) return true;
  return cover.next.startsAt > cover.endsAt;
}
