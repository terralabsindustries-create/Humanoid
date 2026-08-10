"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { Field } from "@/components/primitives/field";
import { Input } from "@/components/primitives/input";
import { ChoiceCards } from "@/components/primitives/choice-cards";
import { useOnboarding, type OrganizationInfo } from "@/lib/store/onboarding";
import { buildProgressSteps } from "@/lib/onboarding/routing";
import { createWorkspace, updateWorkspaceOrganization } from "@/lib/services/http/workspaces";
import { HttpError } from "@/lib/services/http/client";

const COMPANY_SIZES = [
  { id: "1-10", label: "1–10 people" },
  { id: "11-50", label: "11–50 people" },
  { id: "51-200", label: "51–200 people" },
  { id: "201-1000", label: "201–1,000 people" },
  { id: "1000+", label: "1,000+ people" },
];

const COUNTRIES = [
  "United Kingdom",
  "United States",
  "Canada",
  "Ireland",
  "Australia",
  "New Zealand",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Netherlands",
  "United Arab Emirates",
  "India",
  "Singapore",
  "Other",
];

export default function OrganizationSetupPage() {
  const router = useRouter();
  const hydrated = useOnboarding((s) => s.hydrated);
  const hydrate = useOnboarding((s) => s.hydrate);
  const snapshot = useOnboarding();
  const setOrganization = useOnboarding((s) => s.setOrganization);
  const setWorkspaceId = useOnboarding((s) => s.setWorkspaceId);

  const [form, setForm] = useState<OrganizationInfo>(snapshot.organization);
  const [errors, setErrors] = useState<Partial<Record<keyof OrganizationInfo, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Once hydration lands, adopt whatever was already saved for this session.
  // A render-time adjustment rather than an effect: `syncedHydration` tracks
  // whether this has already happened, so it fires exactly once, in the same
  // commit hydration becomes visible, instead of a frame after.
  const [syncedHydration, setSyncedHydration] = useState(false);
  if (hydrated && !syncedHydration) {
    setSyncedHydration(true);
    setForm(snapshot.organization);
  }

  if (!hydrated) return null;

  const set = <K extends keyof OrganizationInfo>(key: K, value: OrganizationInfo[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!form.businessName.trim()) next.businessName = "Enter your business name.";
    if (!form.website.trim()) next.website = "Enter your website.";
    else if (!/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(form.website.trim())) {
      next.website = "Enter a valid website, like example.com.";
    }
    if (!form.country) next.country = "Select a country.";
    if (!form.companySize) next.companySize = "Select a company size.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleContinue = async () => {
    if (!validate()) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (snapshot.workspaceId) {
        await updateWorkspaceOrganization(snapshot.workspaceId, form);
      } else {
        const { workspace } = await createWorkspace(form);
        setWorkspaceId(workspace.id);
      }
      setOrganization(form);
      router.push("/onboarding/industry");
    } catch (error) {
      setSubmitError(
        error instanceof HttpError
          ? error.message
          : "Couldn't save your business details. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OnboardingShell
      steps={buildProgressSteps(snapshot, "organization")}
      title="Tell us about your business"
      description="A few essentials. The details that make Humanoid feel like it was built for you come next."
      onContinue={handleContinue}
      continueLoading={submitting}
    >
      <div className="space-y-5">
        {submitError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {submitError}
          </p>
        )}

        <Field label="Business name" htmlFor="businessName" error={errors.businessName} required>
          <Input
            id="businessName"
            value={form.businessName}
            onChange={(e) => set("businessName", e.target.value)}
            invalid={!!errors.businessName}
            placeholder="Lumina Grand Hotel"
          />
        </Field>

        <Field label="Website" htmlFor="website" error={errors.website} required>
          <Input
            id="website"
            value={form.website}
            onChange={(e) => set("website", e.target.value)}
            invalid={!!errors.website}
            placeholder="luminagrand.com"
          />
        </Field>

        <Field label="Country" htmlFor="country" error={errors.country} required>
          <select
            id="country"
            value={form.country}
            onChange={(e) => set("country", e.target.value)}
            className="h-10 w-full rounded-input border border-line-strong bg-elevated px-3 text-md text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            <option value="" disabled>
              Select a country
            </option>
            {COUNTRIES.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Company size" error={errors.companySize} required>
          <ChoiceCards
            ariaLabel="Company size"
            options={COMPANY_SIZES}
            value={form.companySize}
            onChange={(v) => set("companySize", v as string)}
            columns={2}
            size="sm"
          />
        </Field>
      </div>
    </OnboardingShell>
  );
}
