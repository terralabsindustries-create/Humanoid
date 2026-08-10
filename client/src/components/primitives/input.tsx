"use client";

import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const FIELD_STYLE = cn(
  "w-full rounded-input border bg-elevated px-3 text-md text-ink",
  "placeholder:text-faint transition-colors",
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        FIELD_STYLE,
        "h-10",
        invalid ? "border-danger" : "border-line-strong",
        className,
      )}
      {...props}
    />
  );
});

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, invalid, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          FIELD_STYLE,
          "min-h-24 resize-y py-2.5 leading-relaxed",
          invalid ? "border-danger" : "border-line-strong",
          className,
        )}
        {...props}
      />
    );
  },
);

/**
 * Password field with a show/hide toggle. The toggle is a real button rather
 * than a hover reveal — it must work by keyboard and on touch, both of which
 * a hover-only affordance would fail.
 */
export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pr-10", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className={cn(
            "absolute top-1/2 right-1 -translate-y-1/2 rounded-control p-1.5",
            "text-faint transition-colors hover:text-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
          )}
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>
    );
  },
);
