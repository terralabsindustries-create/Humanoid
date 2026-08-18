/**
 * Knowledge logic that is not a screen.
 *
 * Knowledge is a *workspace asset*, not something an AI employee owns (arch
 * §3.1), so the questions this file answers are asked about the workspace and
 * only then attributed to employees: what can be answered, what two sources
 * disagree about, what nothing covers, and who is currently allowed to read
 * from each source.
 *
 * The ordering rules live here rather than in the screen for the same reason
 * the review ranking does: a header sentence that counts one way and a list
 * that sorts another is how an operator learns not to trust either.
 */

import type {
  AIEmployee,
  KnowledgeConflict,
  KnowledgeGap,
  KnowledgeItem,
  KnowledgeSource,
} from "./types";

/**
 * Unresolved first, then by how often the topic comes up.
 *
 * A contradiction is the most damaging thing knowledge can hold — two approved
 * sources disagreeing produce a *confident* wrong answer rather than a decline
 * (arch §12, risk 8) — so ask count here is a measure of harm already done,
 * not of popularity.
 */
export function rankConflicts(
  conflicts: KnowledgeConflict[],
): KnowledgeConflict[] {
  return [...conflicts].sort((a, b) => {
    const byStatus = Number(a.status === "resolved") - Number(b.status === "resolved");
    if (byStatus !== 0) return byStatus;
    const byAsks = b.askCount - a.askCount;
    if (byAsks !== 0) return byAsks;
    return b.lastAskedAt.localeCompare(a.lastAskedAt);
  });
}

/**
 * Gaps with nothing written yet first, then by how many people hit them.
 *
 * A gap with a draft answer against it stays in the list — the draft is not
 * published, so callers are still being declined — but it stops competing for
 * attention with the ones nobody has touched.
 */
export function rankGaps(gaps: KnowledgeGap[]): KnowledgeGap[] {
  return [...gaps].sort((a, b) => {
    const byDrafted = Number(a.draftItemId !== null) - Number(b.draftItemId !== null);
    if (byDrafted !== 0) return byDrafted;
    const byAsks = b.askCount - a.askCount;
    if (byAsks !== 0) return byAsks;
    return b.lastAskedAt.localeCompare(a.lastAskedAt);
  });
}

/**
 * How many decisions are actually waiting on a person.
 *
 * Deliberately not "how many conflicts and gaps exist": a gap somebody has
 * already drafted an answer for is waiting on a release, not on a decision,
 * and counting it here would keep a badge lit at someone who has done the work.
 */
export function openDecisions(
  conflicts: KnowledgeConflict[],
  gaps: KnowledgeGap[],
): number {
  return (
    conflicts.filter((conflict) => conflict.status === "unresolved").length +
    gaps.filter((gap) => gap.draftItemId === null).length
  );
}

/** Times callers hit a question nothing answers, across every open gap. */
export function totalAsked(gaps: KnowledgeGap[]): number {
  return gaps.reduce((sum, gap) => sum + gap.askCount, 0);
}

export type SourceHealth = {
  inUse: number;
  /** Sources that cannot answer anything right now, and why matters to them. */
  failing: KnowledgeSource[];
  stale: KnowledgeSource[];
  syncing: KnowledgeSource[];
};

export function sourceHealth(sources: KnowledgeSource[]): SourceHealth {
  return {
    inUse: sources.filter((source) => source.status === "ready").length,
    failing: sources.filter((source) => source.status === "error"),
    stale: sources.filter((source) => source.status === "stale"),
    syncing: sources.filter((source) => source.status === "syncing"),
  };
}

export type AnswerCounts = {
  approved: number;
  draft: number;
  stale: number;
};

/**
 * Answers by state.
 *
 * `approved` is the only figure that describes what the AI can say today, so
 * it is the one the header leads with — a workspace with two hundred drafts
 * and no approved answers can answer nothing at all.
 */
export function answerCounts(items: KnowledgeItem[]): AnswerCounts {
  return {
    approved: items.filter((item) => item.status === "approved").length,
    draft: items.filter((item) => item.status === "draft").length,
    stale: items.filter((item) => item.status === "stale").length,
  };
}

/**
 * Where an answer written by hand goes.
 *
 * A crawled website or an uploaded PDF is a mirror of something outside the
 * product — writing into it would be overwritten by the next sync. Answers
 * typed here land in the source that is maintained here, and a workspace that
 * has no such source cannot accept one until it does.
 */
export function authoredSource(
  sources: KnowledgeSource[],
): KnowledgeSource | null {
  return (
    sources.find(
      (source) => source.kind === "faq" || source.kind === "manual",
    ) ?? null
  );
}

/**
 * Which AI employees are reading from a source right now.
 *
 * Live versions only. A draft's grants describe an employee that has not been
 * published and is not on the phone, and answering "who is using this?" with
 * an employee nobody can call would be a wrong answer to a question asked for
 * exactly one reason: judging what breaks if this source is wrong.
 */
export function employeesReadingFrom(
  source: KnowledgeSource,
  employees: AIEmployee[],
): string[] {
  return employees
    .filter((employee) =>
      employee.liveVersion?.grants.knowledgeCollectionIds.includes(
        source.collectionId,
      ),
    )
    .map((employee) => employee.liveVersion!.persona.name);
}

/** Items belonging to a source, most-used first. */
export function itemsForSource(
  sourceId: string,
  items: KnowledgeItem[],
): KnowledgeItem[] {
  return items
    .filter((item) => item.sourceId === sourceId)
    .sort((a, b) => b.useCount - a.useCount);
}

/** Matches a question or its answer. Search here is for finding, not ranking. */
export function matchesAnswer(item: KnowledgeItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.question.toLowerCase().includes(q) ||
    item.answer.toLowerCase().includes(q)
  );
}
