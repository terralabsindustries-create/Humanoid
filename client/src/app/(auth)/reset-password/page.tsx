"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthLayout } from "@/components/auth/auth-layout";
import { OtpInput } from "@/components/auth/otp-input";
import { Field } from "@/components/primitives/field";
import { PasswordInput } from "@/components/primitives/input";
import { Button } from "@/components/primitives/button";
import { authService, AuthServiceError } from "@/lib/services/auth";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const debugCode = params.get("debugCode");

  const [step, setStep] = useState<"code" | "password">("code");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!email) {
    return (
      <AuthLayout title="Reset your password">
        <p className="text-sm text-muted">
          This link is missing an email address.{" "}
          <Link href="/forgot-password" className="font-medium text-ink underline-offset-4 hover:underline">
            Start over
          </Link>
          .
        </p>
      </AuthLayout>
    );
  }

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!password) nextErrors.password = "Choose a new password.";
    else if (password.length < 8) nextErrors.password = "Use at least 8 characters.";
    if (confirmPassword !== password) nextErrors.confirmPassword = "Passwords don't match.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      await authService.resetPassword({ email, code, newPassword: password });
      router.push("/login?reset=1");
    } catch (error) {
      if (error instanceof AuthServiceError) {
        setStep("code");
        setCode("");
        setSubmitError(error.message);
      } else {
        setSubmitError("Couldn't reset your password. Check your connection and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "code") {
    return (
      <AuthLayout
        title="Enter your code"
        description={`Enter the 6-digit code we sent to ${email}.`}
        footer={
          <Link href="/forgot-password" className="font-medium text-ink underline-offset-4 hover:underline">
            Use a different email
          </Link>
        }
      >
        <div className="space-y-5">
          <OtpInput
            value={code}
            onChange={setCode}
            onComplete={() => setStep("password")}
            invalid={!!submitError}
          />
          {submitError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {submitError}
            </p>
          )}
          <p className="text-xs text-faint">
            {debugCode ? (
              <>
                Nothing arrives in this preview — use{" "}
                <span className="font-mono text-2xs text-muted">{debugCode}</span>.
              </>
            ) : (
              "Check your email for the code."
            )}
          </p>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={code.length !== 6}
            onClick={() => setStep("password")}
          >
            Continue
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      footer={
        <button
          type="button"
          onClick={() => setStep("code")}
          className="font-medium text-ink underline-offset-4 hover:underline"
        >
          Back
        </button>
      }
    >
      <form onSubmit={handleReset} noValidate className="space-y-4">
        <Field label="New password" htmlFor="password" error={errors.password} required>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={!!errors.password}
            placeholder="At least 8 characters"
          />
        </Field>
        <Field
          label="Confirm new password"
          htmlFor="confirmPassword"
          error={errors.confirmPassword}
          required
        >
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            invalid={!!errors.confirmPassword}
          />
        </Field>

        {submitError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {submitError}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full">
          Reset password
        </Button>
      </form>
    </AuthLayout>
  );
}
