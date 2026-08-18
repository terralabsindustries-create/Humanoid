/**
 * Audit logic that is not a screen.
 *
 * An audit log's job is not to list events — it is to let someone reconstruct
 * what happened and prove it later. That puts two requirements on this file
 * that an ordinary activity feed would not have.
 *
 * First, the taxonomy has to be stable. Actions arrive as dotted tokens
 * (`recording.access`, `employee.publish`) and a screen that guessed at their
 * wording would rephrase the record every time the copy changed. The map below
 * is the wording; anything unmapped falls through to `humanize` and still reads
 * as a sentence rather than as a token.
 *
 * Second, some entries matter more than others, and not because they are
 * severe. Listening to a recording is not an error — it is a completely normal
 * thing for an operator to do — but it is the line a regulator, or a patient,
 * will ask about first. Those actions are marked here rather than in the
 * screen, so the queue, an export and any later surface cannot disagree about
 * what counts as sensitive.
 */

import { humanize, INTERVENTION_LABEL } from "./labels";
import type { AuditEvent } from "./types";
import type { Tone } from "@/components/primitives/status";

export type AuditCategory =
  | "conversation"
  | "recording"
  | "customer"
  | "employee"
  | "governance"
  | "export"
  | "access";

export const AUDIT_CATEGORY_LABEL: Record<AuditCategory, string> = {
  conversation: "Live handling",
  recording: "Recording access",
  customer: "Customer data",
  employee: "AI configuration",
  governance: "Governance",
  export: "Exports",
  access: "Sign-in",
};

/**
 * Prefix → category. The prefix is the noun the action happened to, which is
 * the axis someone reconstructing an incident actually filters on: "show me
 * everything that touched a recording", not "show me every delete".
 */
const CATEGORY_BY_PREFIX: Record<string, AuditCategory> = {
  conversation: "conversation",
  recording: "recording",
  party: "customer",
  record: "customer",
  employee: "employee",
  knowledge: "employee",
  procedure: "employee",
  people: "governance",
  workspace: "governance",
  retention: "governance",
  channel: "governance",
  audit: "export",
  access: "access",
};

export function auditCategory(action: string): AuditCategory {
  const prefix = action.split(".")[0] ?? "";
  return CATEGORY_BY_PREFIX[prefix] ?? "governance";
}

/**
 * The wording of each action, in the past tense, as a person would say it.
 *
 * Deliberately free of domain nouns — "Listened to a recording" reads the same
 * in a clinic and a law firm, so these are labels rather than lexicon. Where an
 * action does concern a domain object the noun stays in the event's own
 * `target` and `detail`, which the API wrote and this file does not rephrase.
 */
const ACTION_LABEL: Record<string, string> = {
  // Sourced from the intervention labels rather than restated. The audit log
  // and the conversation timeline describe the same four acts, and an audit
  // entry that worded one of them differently would read as a different event.
  "conversation.takeover": INTERVENTION_LABEL.takeover,
  "conversation.transfer": INTERVENTION_LABEL.transfer,
  "conversation.coach": INTERVENTION_LABEL.coach,
  "conversation.monitor": INTERVENTION_LABEL.monitor,
  "recording.access": "Listened to a recording",
  "recording.download": "Downloaded a recording",
  "recording.blocked": "Recording playback refused",
  "party.pii_reveal": "Revealed hidden personal details",
  "party.fact_correct": "Corrected a fact on a customer record",
  "record.create": "Created a record",
  "record.update": "Updated a record",
  "record.cancel": "Cancelled a record",
  "employee.publish": "Published a new version",
  "employee.pause": "Paused an AI employee",
  "employee.resume": "Resumed an AI employee",
  "employee.authority_raise": "Raised what the AI may do alone",
  "employee.authority_lower": "Lowered what the AI may do alone",
  "knowledge.approve": "Approved a knowledge answer",
  "knowledge.edit": "Edited a knowledge answer",
  "procedure.edit": "Edited a procedure",
  "people.role_change": "Changed someone's role",
  "people.oncall_change": "Moved the on-call pager",
  "retention.change": "Changed a retention policy",
  "channel.change": "Changed a phone number's routing",
  "workspace.settings": "Changed a workspace setting",
  "audit.export": "Exported the audit log",
  "access.sign_in": "Signed in",
  "access.sign_in_failed": "Failed sign-in attempt",
};

export function auditActionLabel(action: string): string {
  return ACTION_LABEL[action] ?? humanize(action.replace(/\./g, " "));
}

/**
 * Actions that read or remove customer data rather than change configuration.
 *
 * These are not errors and are not rendered as alarming. They are marked
 * because they are the entries someone will one day have to account for, and a
 * log where they are indistinguishable from a settings change cannot answer
 * "who listened to my call?" without a manual scan.
 */
const SENSITIVE_ACTIONS = new Set([
  "recording.access",
  "recording.download",
  "party.pii_reveal",
  "audit.export",
]);

export function isSensitive(event: AuditEvent): boolean {
  return SENSITIVE_ACTIONS.has(event.action);
}

/**
 * Actor hue. `ai` and `human` are the product's reserved pair and this is
 * exactly the axis they are reserved for — who acted — so using them here
 * reinforces the rule rather than borrowing from it. A system actor is neither
 * and takes the neutral tone.
 */
export const ACTOR_TONE: Record<AuditEvent["actor"]["kind"], Tone> = {
  user: "human",
  ai: "ai",
  system: "neutral",
};

export const ACTOR_LABEL: Record<AuditEvent["actor"]["kind"], string> = {
  user: "Person",
  ai: "AI",
  system: "System",
};

export type CategoryFacet = {
  category: AuditCategory;
  count: number;
};

/** Categories present in a set of events, most frequent first. */
export function categoryFacets(events: AuditEvent[]): CategoryFacet[] {
  const byCategory = new Map<AuditCategory, CategoryFacet>();

  for (const event of events) {
    const category = auditCategory(event.action);
    const facet = byCategory.get(category) ?? { category, count: 0 };
    facet.count += 1;
    byCategory.set(category, facet);
  }

  return [...byCategory.values()].sort((a, b) => b.count - a.count);
}

export type AuditDay = {
  /** "2026-08-17" — sortable, and the grouping key. */
  key: string;
  events: AuditEvent[];
};

/**
 * Events grouped into days, newest day first and newest event first within it.
 *
 * Grouping happens on a caller-supplied day key so the workspace timezone
 * decides where a day ends, not the reader's browser. An audit log that
 * regrouped itself because someone opened it abroad would undermine the exact
 * property it exists to provide.
 */
export function groupByDay(
  events: AuditEvent[],
  dayKeyOf: (iso: string) => string,
): AuditDay[] {
  const byDay = new Map<string, AuditEvent[]>();

  for (const event of events) {
    const key = dayKeyOf(event.at);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(event);
    else byDay.set(key, [event]);
  }

  return [...byDay.entries()]
    .map(([key, dayEvents]) => ({
      key,
      events: [...dayEvents].sort((a, b) => b.at.localeCompare(a.at)),
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
}

export type AuditFilters = {
  actorKind?: AuditEvent["actor"]["kind"] | null;
  category?: AuditCategory | null;
  /** Matches actor label, action wording, target and detail. */
  search?: string;
  sensitiveOnly?: boolean;
};

export function filterEvents(
  events: AuditEvent[],
  filters: AuditFilters,
): AuditEvent[] {
  const needle = filters.search?.trim().toLowerCase() ?? "";

  return events.filter((event) => {
    if (filters.actorKind && event.actor.kind !== filters.actorKind) {
      return false;
    }
    if (filters.category && auditCategory(event.action) !== filters.category) {
      return false;
    }
    if (filters.sensitiveOnly && !isSensitive(event)) return false;
    if (!needle) return true;

    return [
      event.actor.label,
      auditActionLabel(event.action),
      event.action,
      event.target,
      event.detail,
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

/**
 * Events as CSV, for the export.
 *
 * Every field is quoted and internal quotes are doubled, because `detail` is
 * free text written by whatever raised the event and a log that corrupted its
 * own export the first time someone wrote a comma would be worse than no
 * export at all. The action column carries both the token and its wording: the
 * token is what a machine will match on later, the wording is what the person
 * opening the file in a spreadsheet needs to read.
 */
export function toCsv(events: AuditEvent[]): string {
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = [
    "id",
    "timestamp",
    "actor_kind",
    "actor_id",
    "actor",
    "action",
    "action_label",
    "category",
    "target",
    "detail",
    "sensitive",
  ];

  const rows = events.map((event) =>
    [
      event.id,
      event.at,
      event.actor.kind,
      event.actor.id,
      event.actor.label,
      event.action,
      auditActionLabel(event.action),
      AUDIT_CATEGORY_LABEL[auditCategory(event.action)],
      event.target,
      event.detail,
      isSensitive(event) ? "yes" : "no",
    ].map(cell).join(","),
  );

  return [header.map(cell).join(","), ...rows].join("\r\n");
}
