"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/auth-layout";
import { OtpInput } from "@/components/auth/otp-input";
import { Button } from "@/components/primitives/button";
import { authService, AuthServiceError } from "@/lib/services/auth";
import { useAuth } from "@/lib/store/auth";
import { bootstrapSession } from "@/lib/onboarding/bootstrap";

const RESEND_SECONDS = 30;

export default function VerifyPage() {
  const router = useRouter();
  const status = useAuth((s) => s.status);
  const email = useAuth((s) => s.email);
  const pendingDebugCode = useAuth((s) => s.pendingDebugCode);
  const setPendingDebugCode = useAuth((s) => s.setPendingDebugCode);
  const signIn = useAuth((s) => s.signIn);

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const [justResent, setJustResent] = useState(false);

  // Nothing to verify — either never signed up, or already verified.
  useEffect(() => {
    if (status === "anonymous") router.replace("/signup");
    if (status === "authenticated") router.replace("/onboarding/organization");
  }, [status, router]);

  useEffect(() => {
    if (resendCooldown === 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const submit = async (value: string) => {
    if (!email || value.length !== 6) return;
    setError(null);
    setVerifying(true);
    try {
      const session = await authService.verifyOtp({ email, code: value });
      signIn(session.email, session.name);
      const { destination } = await bootstrapSession();
      router.push(destination);
    } catch (err) {
      setError(
        err instanceof AuthServiceError
          ? err.message
          : "Couldn't verify that code. Check your connection and try again.",
      );
      setCode("");
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!email || resendCooldown > 0) return;
    setResending(true);
    try {
      const result = await authService.resendOtp(email);
      setPendingDebugCode(result.debugCode ?? null);
      setResendCooldown(RESEND_SECONDS);
      setJustResent(true);
      setTimeout(() => setJustResent(false), 3000);
    } finally {
      setResending(false);
    }
  };

  if (status !== "pending_verification" || !email) return null;

  return (
    <AuthLayout
      title="Check your email"
      description={`Enter the 6-digit code we sent to ${email}.`}
      footer={
        <Link
          href="/signup"
          className="font-medium text-ink underline-offset-4 hover:underline"
        >
          Use a different email
        </Link>
      }
    >
      <div className="space-y-5">
        <OtpInput
          value={code}
          onChange={(v) => {
            setCode(v);
            if (error) setError(null);
          }}
          onComplete={submit}
          disabled={verifying}
          invalid={!!error}
        />

        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}

        {/* No email provider is wired up yet — see EXPOSE_OTP_IN_RESPONSE in
            the backend. The code is shown outright rather than pretending
            delivery happened; once a real provider lands, `pendingDebugCode`
            is simply null and this falls back to "check your email". */}
        <p className="text-xs text-faint">
          {pendingDebugCode ? (
            <>
              Nothing arrives in this preview — use{" "}
              <span className="font-mono text-2xs text-muted">{pendingDebugCode}</span>.
            </>
          ) : (
            "Check your email for the code."
          )}
        </p>

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          loading={verifying}
          disabled={code.length !== 6}
          onClick={() => submit(code)}
        >
          Verify
        </Button>

        <div className="flex items-center justify-center gap-1.5 text-sm text-muted">
          {justResent ? (
            <span>Code resent.</span>
          ) : (
            <>
              <span>Didn&apos;t get a code?</span>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || resending}
                className="font-medium text-ink underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-faint disabled:no-underline"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
              </button>
            </>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
