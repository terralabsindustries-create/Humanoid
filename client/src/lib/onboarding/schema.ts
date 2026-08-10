import { z } from "zod";
import type { LucideIcon } from "lucide-react";

/**
 * The onboarding question schema.
 *
 * This is the contract between "what Humanoid needs to know about a business"
 * and "what renders on screen." A question is data, never a component — the
 * same six primitives (`QuestionRenderer`) render every question in every
 * industry pack.
 *
 * That separation is what makes the next step possible without touching this
 * layer or the renderer: a business's website, its uploaded documents, and its
 * previous answers can eventually produce *more* normalized questions the same
 * shape as these, generated rather than authored, inserted into the same
 * section, answered by the same UI. The frontend must never need to know
 * whether a question came from a domain pack's static list or from an AI
 * reading a website — see `docs` in `lib/domains/types.ts` for where that
 * seam is designed to sit.
 */

export type QuestionType =
  | "single_select"
  | "multi_select"
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "time"
  | "date"
  | "url"
  | "choice_cards";

export type QuestionOption = {
  id: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
};

/**
 * All conditions on a question must pass for it to render. Values are
 * compared against the answer already recorded for `questionId` — which must
 * therefore belong to the same section or an earlier one; a forward reference
 * would mean the question can never resolve.
 */
export type QuestionCondition =
  | { questionId: string; equals: string | boolean }
  | { questionId: string; oneOf: string[] }
  /** For multi_select answers: at least one of these must be selected. */
  | { questionId: string; includes: string };

export type ValidationRule =
  | { kind: "required" }
  | { kind: "minLength"; value: number }
  | { kind: "pattern"; value: string; message: string }
  | { kind: "url" };

export type OnboardingQuestion = {
  id: string;
  sectionId: string;
  type: QuestionType;
  title: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: QuestionOption[];
  conditions?: QuestionCondition[];
  validation?: ValidationRule[];
  /**
   * Renders larger and alone rather than stacked with its section's other
   * questions — reserved for the one or two questions per pack that deserve a
   * moment (naming the AI employee, choosing its voice). Using this on more
   * than a couple of questions per section defeats the point of grouping
   * related fields together in the first place.
   */
  emphasis?: boolean;
};

export type OnboardingSection = {
  id: string;
  title: string;
  /** Short label for the progress rail — "Property", not "Tell us about your property". */
  progressLabel: string;
  description?: string;
  questions: OnboardingQuestion[];
};

export type AnswerValue = string | string[] | number | boolean | null;
export type OnboardingAnswers = Record<string, AnswerValue>;

/** Whether every condition on a question currently holds, given prior answers. */
export function conditionsMet(
  question: OnboardingQuestion,
  answers: OnboardingAnswers,
): boolean {
  if (!question.conditions?.length) return true;
  return question.conditions.every((condition) => {
    const value = answers[condition.questionId];
    if ("equals" in condition) return value === condition.equals;
    if ("oneOf" in condition) {
      return typeof value === "string" && condition.oneOf.includes(value);
    }
    if ("includes" in condition) {
      return Array.isArray(value) && value.includes(condition.includes);
    }
    return true;
  });
}

/** Questions in a section that are currently visible, given prior answers. */
export function visibleQuestions(
  section: OnboardingSection,
  answers: OnboardingAnswers,
): OnboardingQuestion[] {
  return section.questions.filter((q) => conditionsMet(q, answers));
}

function zodForQuestion(question: OnboardingQuestion): z.ZodTypeAny {
  const rules = question.validation ?? [];
  const isRequired =
    question.required || rules.some((r) => r.kind === "required");

  let schema: z.ZodTypeAny;

  switch (question.type) {
    case "multi_select":
      schema = z.array(z.string());
      if (isRequired) schema = (schema as z.ZodArray<z.ZodString>).min(1);
      return isRequired ? schema : schema.optional();
    case "boolean":
      return isRequired ? z.boolean() : z.boolean().optional();
    case "number": {
      const num = z.number();
      return isRequired ? num : num.optional();
    }
    default: {
      let str = z.string();
      for (const rule of rules) {
        if (rule.kind === "minLength") str = str.min(rule.value);
        if (rule.kind === "pattern") {
          str = str.regex(new RegExp(rule.value), rule.message);
        }
        if (rule.kind === "url") str = str.url();
      }
      if (question.type === "url" && !rules.some((r) => r.kind === "url")) {
        str = str.url();
      }
      schema = isRequired ? str.min(1, "This is required") : str.optional();
      return schema;
    }
  }
}

/**
 * Validate one answer against its question. Returns the first failing
 * message, or null when the value is acceptable — including when the question
 * is currently hidden by a condition, since a hidden question cannot be
 * answered wrong.
 */
export function validateAnswer(
  question: OnboardingQuestion,
  answers: OnboardingAnswers,
): string | null {
  if (!conditionsMet(question, answers)) return null;
  const value = answers[question.id];
  const result = zodForQuestion(question).safeParse(
    value === null ? undefined : value,
  );
  if (result.success) return null;
  return result.error.issues[0]?.message ?? "This value isn't valid.";
}

/** Every visible, required-and-unmet question across a section. */
export function sectionErrors(
  section: OnboardingSection,
  answers: OnboardingAnswers,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const question of visibleQuestions(section, answers)) {
    const message = validateAnswer(question, answers);
    if (message) errors[question.id] = message;
  }
  return errors;
}

export function isSectionComplete(
  section: OnboardingSection,
  answers: OnboardingAnswers,
): boolean {
  return Object.keys(sectionErrors(section, answers)).length === 0;
}

/**
 * An answer for display — option ids resolved to their labels, booleans to
 * "Yes"/"No". Used by the Review screen, which must read every pack's answers
 * without knowing anything about what any individual pack asked.
 */
export function formatAnswer(
  question: OnboardingQuestion,
  value: AnswerValue,
): string | string[] | null {
  if (value === null || value === undefined || value === "") return null;

  const labelFor = (id: string) =>
    question.options?.find((o) => o.id === id)?.label ?? id;

  switch (question.type) {
    case "boolean":
      return value ? "Yes" : "No";
    case "multi_select": {
      const ids = Array.isArray(value) ? value : [];
      return ids.length ? ids.map(labelFor) : null;
    }
    case "single_select":
    case "choice_cards":
      return labelFor(String(value));
    case "number":
      return String(value);
    default:
      return String(value);
  }
}
