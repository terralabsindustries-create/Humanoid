"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Six-digit OTP entry.
 *
 * One visible `<input>` per digit rather than one field with letter-spacing —
 * the six boxes are what let a screen reader user, and a sighted one, tell at
 * a glance how many digits are filled versus still needed. Each box still
 * carries a real accessible name ("Digit 3 of 6") rather than relying on
 * position alone.
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  autoFocus = true,
}: {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  // Re-triggers the shake once per false→true transition of `invalid`. Doing
  // this as a render-time adjustment (React's sanctioned alternative to an
  // effect for "respond to a prop changing") rather than in a `useEffect`
  // means the shake and the paint it belongs to land in the same commit.
  const [shakeKey, setShakeKey] = useState(0);
  const [prevInvalid, setPrevInvalid] = useState(invalid);
  if (invalid !== prevInvalid) {
    setPrevInvalid(invalid);
    if (invalid) setShakeKey((k) => k + 1);
  }

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
    // Only on mount — re-focusing on every value change would steal focus
    // from wherever the user just moved it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDigit = (index: number, digit: string) => {
    const next = digits.slice();
    next[index] = digit;
    const joined = next.join("");
    onChange(joined);
    if (joined.length === length && !next.includes("")) onComplete?.(joined);
  };

  const handleChange = (index: number, raw: string) => {
    const clean = raw.replace(/\D/g, "");
    if (!clean) {
      setDigit(index, "");
      return;
    }
    // Typing over a filled box, or a fast typer whose keystroke lands before
    // the previous one's focus move — take the last digit entered.
    const digit = clean[clean.length - 1];
    setDigit(index, digit);
    if (index < length - 1) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      refs.current[index - 1]?.focus();
      setDigit(index - 1, "");
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      refs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowRight" && index < length - 1) {
      event.preventDefault();
      refs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    refs.current[Math.max(pasted.length - 1, 0)]?.focus();
    if (pasted.length === length) onComplete?.(pasted);
  };

  return (
    <div
      key={shakeKey}
      role="group"
      aria-label={`${length}-digit verification code`}
      className={cn("flex gap-2", invalid && shakeKey > 0 && "shake-once")}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          maxLength={1}
          className={cn(
            "h-12 w-10 rounded-input border bg-elevated text-center text-lg font-medium text-ink tabular",
            "transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
            "disabled:cursor-not-allowed disabled:opacity-50",
            invalid ? "border-danger" : "border-line-strong",
          )}
        />
      ))}
    </div>
  );
}
