"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Field } from "@/components/primitives/field";
import { Input, PasswordInput } from "@/components/primitives/input";
import { Checkbox } from "@/components/primitives/checkbox";
import { Button } from "@/components/primitives/button";
import { authService, AuthServiceError } from "@/lib/services/auth";
import { useAuth } from "@/lib/store/auth";
import { OAuthRow } from "@/components/auth/oauth-row";

type FormState = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreed: boolean;
};

const EMPTY: FormState = { name: "", email: "", password: "", confirmPassword: "", agreed: false };

function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!form.name.trim()) errors.name = "Enter your full name.";
  if (!form.email.trim()) errors.email = "Enter your work email.";
  else if (!/^\S+@\S+\.\S+$/.test(form.email)) errors.email = "Enter a valid email address.";
  if (!form.password) errors.password = "Choose a password.";
  else if (form.password.length < 8) errors.password = "Use at least 8 characters.";
  if (form.confirmPassword !== form.password) {
    errors.confirmPassword = "Passwords don't match.";
  }
  if (!form.agreed) errors.agreed = "You need to accept the terms to continue.";
  return errors;
}

export default function SignupPage() {
  const router = useRouter();
  const beginVerification = useAuth((s) => s.beginVerification);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await authService.requestSignup({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      beginVerification(form.email.trim(), form.name.trim(), result.debugCode);
      router.push("/verify");
    } catch (error) {
      setSubmitError(
        error instanceof AuthServiceError
          ? error.message
          : "Couldn't create your account. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      description="Set up Humanoid for your business in a few minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-ink underline-offset-4 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label="Full name" htmlFor="name" error={errors.name} required>
          <Input
            id="name"
            autoComplete="name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            invalid={!!errors.name}
            placeholder="Jordan Ellis"
          />
        </Field>

        <Field label="Work email" htmlFor="email" error={errors.email} required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            invalid={!!errors.email}
            placeholder="you@company.com"
          />
        </Field>

        <Field label="Password" htmlFor="password" error={errors.password} required>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            invalid={!!errors.password}
            placeholder="At least 8 characters"
          />
        </Field>

        <Field
          label="Confirm password"
          htmlFor="confirmPassword"
          error={errors.confirmPassword}
          required
        >
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(e) => set("confirmPassword", e.target.value)}
            invalid={!!errors.confirmPassword}
          />
        </Field>

        <label className="flex items-start gap-2.5 pt-1">
          <Checkbox
            checked={form.agreed}
            onChange={(e) => set("agreed", e.target.checked)}
            aria-invalid={!!errors.agreed}
          />
          <span className="text-sm text-muted">
            I agree to the{" "}
            <span className="font-medium text-ink underline-offset-4 hover:underline">
              Terms of Service
            </span>{" "}
            and{" "}
            <span className="font-medium text-ink underline-offset-4 hover:underline">
              Privacy Policy
            </span>
            .
          </span>
        </label>
        {errors.agreed && (
          <p role="alert" className="-mt-2 text-xs font-medium text-danger">
            {errors.agreed}
          </p>
        )}

        {submitError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {submitError}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full">
          Create account
        </Button>
      </form>

      <OAuthRow />
    </AuthLayout>
  );
}
