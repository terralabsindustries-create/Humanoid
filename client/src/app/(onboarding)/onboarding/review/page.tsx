"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { useOnboarding } from "@/lib/store/onboarding";
import { buildProgressSteps, resumeHref } from "@/lib/onboarding/routing";
import { getDomainPack } from "@/lib/domains/registry";
import {
  formatAnswer,
  visibleQuestions,
  type OnboardingAnswers,
  type OnboardingQuestion,
  type OnboardingSection,
} from "@/lib/onboarding/schema";
import { STANDARD_AI_QUESTION_IDS } from "@/lib/domains/shared";

export default function ReviewPage() {
  const router = useRouter();
  const hydrated = useOnboarding((s) => s.hydrated);
  const hydrate = useOnboarding((s) => s.hydrate);
  const snapshot = useOnboarding();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    const href = resumeHref(snapshot);
    if (href !== "/onboarding/review" && href !== "/today") router.replace(href);
  }, [hydrated, snapshot, router]);

  if (!hydrated || !snapshot.industry) return null;

  const pack = getDomainPack(snapshot.industry);
  const { answers } = snapshot;
  const sections = pack.onboardingSections;
  const aiEmployeeSection = sections[sections.length - 1];
  const factSections = sections.slice(0, -1);
  const lastSectionHref = `/onboarding/${aiEmployeeSection.id}`;

  const aiNameQuestion = findQuestion(sections, STANDARD_AI_QUESTION_IDS.name);
  const styleQuestion = findQuestion(sections, STANDARD_AI_QUESTION_IDS.style);
  const escalationQuestion = findQuestion(sections, STANDARD_AI_QUESTION_IDS.escalation);

  const aiName =
    (aiNameQuestion && (answers[aiNameQuestion.id] as string)) || pack.aiEmployeeNamePlaceholder;
  const style = styleQuestion ? formatAnswer(styleQuestion, answers[styleQuestion.id]) : null;
  const escalates = escalationQuestion
    ? formatAnswer(escalationQuestion, answers[escalationQuestion.id])
    : null;

  // The first multi-select answered outside the AI section stands in for
  // "what this employee can help with" — grounded in what was actually
  // answered rather than an invented capability list.
  const canHelpWith = firstMultiSelectAnswer(factSections, answers);

  const handleContinue = () => {
    router.push("/onboarding/creating");
  };

  return (
    <OnboardingShell
      steps={buildProgressSteps(snapshot, "review")}
      title={`Meet your ${pack.aiEmployeeRoleName}`}
      description="This is what Humanoid learned. Anything look off? Edit it before your workspace is created."
      onBack={() => router.push(lastSectionHref)}
      onContinue={handleContinue}
      continueLabel="Create my workspace"
      wide
    >
      <div className="overflow-hidden rounded-dialog border border-line bg-elevated shadow-dialog">
        <div className="border-b border-line bg-accent-surface px-6 py-8 sm:px-8">
          <p className="font-mono text-2xs tracking-wide text-faint uppercase">
            {pack.aiEmployeeRoleName}
          </p>
          <h2 className="mt-1.5 font-display text-4xl text-ink">{aiName}</h2>
        </div>

        <div className="grid gap-x-8 gap-y-6 px-6 py-6 sm:grid-cols-2 sm:px-8">
          {factSections.map((section) => (
            <FactGroup
              key={section.id}
              heading={section.progressLabel}
              editHref={`/onboarding/${section.id}`}
              items={visibleQuestions(section, answers)
                .map((q) => ({ label: q.title, value: formatAnswer(q, answers[q.id]) }))
                .filter((item) => item.value !== null)}
            />
          ))}

          {style && (
            <FactGroup heading="Personality" editHref={lastSectionHref} items={[{ label: "Style", value: style }]} hideLabels />
          )}

          {canHelpWith && (
            <FactGroup heading="Can help with" items={[{ label: "", value: canHelpWith }]} hideLabels />
          )}

          {escalates && (
            <FactGroup
              heading="Escalates to a person when"
              editHref={lastSectionHref}
              items={[{ label: "", value: escalates }]}
              hideLabels
            />
          )}
        </div>
      </div>
    </OnboardingShell>
  );
}

function FactGroup({
  heading,
  editHref,
  items,
  hideLabels = false,
}: {
  heading: string;
  editHref?: string;
  items: { label: string; value: string | string[] | null }[];
  hideLabels?: boolean;
}) {
  const visible = items.filter((i) => i.value !== null);
  if (visible.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-2xs tracking-wide text-faint uppercase">{heading}</p>
        {editHref && (
          <Link
            href={editHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
          >
            <Pencil className="size-3" aria-hidden />
            Edit
          </Link>
        )}
      </div>
      <dl className="mt-2 space-y-1">
        {visible.map((item, i) => (
          <div key={i}>
            {!hideLabels && (
              <dt className="text-2xs text-faint">{item.label}</dt>
            )}
            <dd className="text-sm text-ink">
              {Array.isArray(item.value) ? item.value.join(", ") : item.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function findQuestion(
  sections: OnboardingSection[],
  questionId: string,
): OnboardingQuestion | null {
  for (const section of sections) {
    const match = section.questions.find((q) => q.id === questionId);
    if (match) return match;
  }
  return null;
}

function firstMultiSelectAnswer(
  sections: OnboardingSection[],
  answers: OnboardingAnswers,
): string[] | null {
  for (const section of sections) {
    for (const question of section.questions) {
      if (question.type !== "multi_select") continue;
      const formatted = formatAnswer(question, answers[question.id] ?? null);
      if (Array.isArray(formatted) && formatted.length > 0) return formatted;
    }
  }
  return null;
}
