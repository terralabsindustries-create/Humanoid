"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { QuestionRenderer } from "@/components/onboarding/question-renderer";
import { useOnboarding } from "@/lib/store/onboarding";
import { buildProgressSteps } from "@/lib/onboarding/routing";
import { getDomainPack } from "@/lib/domains/registry";
import { sectionErrors, visibleQuestions } from "@/lib/onboarding/schema";
import { saveAnswer as saveAnswerRemote, markSectionComplete as markSectionCompleteRemote } from "@/lib/services/http/onboarding";
import { HttpError } from "@/lib/services/http/client";

export default function OnboardingSectionPage() {
  const router = useRouter();
  const params = useParams<{ section: string }>();
  const hydrated = useOnboarding((s) => s.hydrated);
  const hydrate = useOnboarding((s) => s.hydrate);
  const snapshot = useOnboarding();
  const setAnswer = useOnboarding((s) => s.setAnswer);
  const markSectionComplete = useOnboarding((s) => s.markSectionComplete);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    if (!snapshot.organization.businessName.trim()) {
      router.replace("/onboarding/organization");
      return;
    }
    if (!snapshot.industry) {
      router.replace("/onboarding/industry");
    }
  }, [hydrated, snapshot.organization.businessName, snapshot.industry, router]);

  if (!hydrated || !snapshot.organization.businessName.trim() || !snapshot.industry) {
    return null;
  }

  const pack = getDomainPack(snapshot.industry);
  const sections = pack.onboardingSections;
  const index = sections.findIndex((s) => s.id === params.section);

  if (index === -1) {
    router.replace(`/onboarding/${sections[0].id}`);
    return null;
  }

  const section = sections[index];
  const questions = visibleQuestions(section, snapshot.answers);
  const previousHref = index === 0 ? "/onboarding/industry" : `/onboarding/${sections[index - 1].id}`;

  const handleContinue = async () => {
    const nextErrors = sectionErrors(section, snapshot.answers);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (!snapshot.workspaceId) {
      router.replace("/onboarding/organization");
      return;
    }

    setSubmitError(null);
    setSubmitting(true);
    try {
      // Synced at the section boundary rather than per keystroke — a
      // deliberate checkpoint, not a network call per character typed.
      // Sequential rather than Promise.all: a handful of concurrent requests
      // to the same workspace is easy to race (and easy to half-fail), and a
      // section has at most a few questions — the extra latency is not
      // worth the risk of a partial save.
      for (const q of questions) {
        await saveAnswerRemote(snapshot.workspaceId, q.id, snapshot.answers[q.id] ?? null);
      }
      await markSectionCompleteRemote(snapshot.workspaceId, section.id);

      markSectionComplete(section.id);
      const next = sections[index + 1];
      router.push(next ? `/onboarding/${next.id}` : "/onboarding/review");
    } catch (err) {
      setSubmitError(
        err instanceof HttpError
          ? err.message
          : "Couldn't save your answers. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OnboardingShell
      steps={buildProgressSteps(snapshot, section.id)}
      title={section.title}
      description={section.description}
      onBack={() => router.push(previousHref)}
      onContinue={handleContinue}
      continueLabel={sections[index + 1] ? "Continue" : "Review"}
      continueLoading={submitting}
    >
      <div className="space-y-6">
        {submitError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {submitError}
          </p>
        )}

        {questions.map((question) => (
          <QuestionRenderer
            key={question.id}
            question={question}
            value={snapshot.answers[question.id] ?? null}
            onChange={(value) => {
              setAnswer(question.id, value);
              if (errors[question.id]) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next[question.id];
                  return next;
                });
              }
            }}
            error={errors[question.id]}
          />
        ))}
      </div>
    </OnboardingShell>
  );
}
