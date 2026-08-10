"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { OAuthRow } from "@/components/auth/oauth-row";
import { Field } from "@/components/primitives/field";
import { Input, PasswordInput } from "@/components/primitives/input";
import { Checkbox } from "@/components/primitives/checkbox";
import { Button } from "@/components/primitives/button";
import { authService, AuthServiceError } from "@/lib/services/auth";
import { useAuth } from "@/lib/store/auth";
import { bootstrapSession } from "@/lib/onboarding/bootstrap";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const justReset = useSearchParams().get("reset") === "1";
  const signIn = useAuth((s) => s.signIn);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const nextErrors: typeof errors = {};
    if (!email.trim()) nextErrors.email = "Enter your email.";
    if (!password) nextErrors.password = "Enter your password.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const session = await authService.login({ email: email.trim(), password });
      signIn(session.email, session.name, remember);
      const { destination } = await bootstrapSession();
      router.push(destination);
    } catch (error) {
      setSubmitError(
        error instanceof AuthServiceError
          ? error.message
          : "Couldn't sign you in. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-ink underline-offset-4 hover:underline">
            Create one
          </Link>
        </>
      }
    >
      {justReset && (
        <p className="mb-5 flex items-center gap-2 rounded-panel bg-success-surface px-3 py-2.5 text-sm text-success">
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          Password updated. Log in with your new password.
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label="Email" htmlFor="email" error={errors.email} required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            invalid={!!errors.email}
            placeholder="you@company.com"
          />
        </Field>

        <Field label="Password" htmlFor="password" error={errors.password} required>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={!!errors.password}
          />
        </Field>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-muted">
            <Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember me
          </label>
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-ink underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        {submitError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {submitError}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full">
          Log in
        </Button>
      </form>

      <OAuthRow />
    </AuthLayout>
  );
}
