"use client";

import { Field } from "@/components/primitives/field";
import { Input, Textarea } from "@/components/primitives/input";
import { ChoiceCards } from "@/components/primitives/choice-cards";
import type {
  AnswerValue,
  OnboardingQuestion,
} from "@/lib/onboarding/schema";

const YES_NO = [
  { id: "true", label: "Yes" },
  { id: "false", label: "No" },
];

/**
 * The one component that renders every question in every industry pack. A
 * question is data (`lib/onboarding/schema.ts`); this is the only place that
 * turns it into pixels. Adding a domain pack, or a tenth question type, never
 * means touching this file's callers — only this switch.
 */
export function QuestionRenderer({
  question,
  value,
  onChange,
  error,
}: {
  question: OnboardingQuestion;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  error?: string | null;
}) {
  // Only single-control types have one focusable element for `<label
  // htmlFor>` to point to. Group-based types (a radiogroup or checkbox group
  // of cards) get their accessible name from ChoiceCards' own aria-label
  // instead — seeing both a `<label>` and an ARIA name for one control step
  // on Field's rendered label below.
  const isGroupType =
    question.type === "boolean" ||
    question.type === "single_select" ||
    question.type === "choice_cards" ||
    question.type === "multi_select";

  return (
    <Field
      label={question.title}
      htmlFor={isGroupType ? undefined : question.id}
      description={question.description}
      error={error}
      required={question.required}
      className={question.emphasis ? "[&>label]:font-display [&>label]:text-xl [&>label]:text-ink" : undefined}
    >
      <Control question={question} value={value} onChange={onChange} invalid={!!error} />
    </Field>
  );
}

function Control({
  question,
  value,
  onChange,
  invalid,
}: {
  question: OnboardingQuestion;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  invalid: boolean;
}) {
  switch (question.type) {
    case "text":
    case "url":
      return (
        <Input
          id={question.id}
          type={question.type === "url" ? "url" : "text"}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder}
          invalid={invalid}
          className={question.emphasis ? "h-12 text-lg" : undefined}
        />
      );

    case "textarea":
      return (
        <Textarea
          id={question.id}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder}
          invalid={invalid}
        />
      );

    case "number":
      return (
        <Input
          id={question.id}
          type="number"
          inputMode="numeric"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          placeholder={question.placeholder}
          invalid={invalid}
        />
      );

    case "time":
      return (
        <Input
          id={question.id}
          type="time"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          invalid={invalid}
          className="w-40"
        />
      );

    case "date":
      return (
        <Input
          id={question.id}
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          invalid={invalid}
          className="w-48"
        />
      );

    case "boolean":
      return (
        <ChoiceCards
          ariaLabel={question.title}
          options={YES_NO}
          value={value === true ? "true" : value === false ? "false" : ""}
          onChange={(v) => onChange(v === "true")}
          columns={2}
          size="sm"
        />
      );

    case "single_select":
    case "choice_cards":
      return (
        <ChoiceCards
          ariaLabel={question.title}
          options={question.options ?? []}
          value={(value as string) ?? ""}
          onChange={(v) => onChange(v as string)}
          columns={(question.options?.length ?? 0) > 4 ? 2 : 1}
        />
      );

    case "multi_select":
      return (
        <ChoiceCards
          ariaLabel={question.title}
          options={question.options ?? []}
          value={(value as string[]) ?? []}
          multiple
          onChange={(v) => onChange(v as string[])}
          columns={2}
        />
      );

    default:
      return null;
  }
}
