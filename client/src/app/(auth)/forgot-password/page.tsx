"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Field } from "@/components/primitives/field";
import { Input } from "@/components/primitives/input";
import { Button } from "@/components/primitives/button";
import { authService } from "@/lib/services/auth";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter the email on your account.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await authService.requestPasswordReset(email.trim());
      const query = new URLSearchParams({ email: email.trim() });
      if (result.debugCode) query.set("debugCode", result.debugCode);
      router.push(`/reset-password?${query.toString()}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      description="We'll send a 6-digit code to your email."
      footer={
        <Link href="/login" className="font-medium text-ink underline-offset-4 hover:underline">
          Back to login
        </Link>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label="Email" htmlFor="email" error={error ?? undefined} required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            invalid={!!error}
            placeholder="you@company.com"
          />
        </Field>

        <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full">
          Send code
        </Button>
      </form>
    </AuthLayout>
  );
}
