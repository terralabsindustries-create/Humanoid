"use client";

import { forwardRef } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { SPRING } from "@/lib/tokens/motion";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-fg hover:bg-accent-hover disabled:bg-accent/40",
  secondary:
    "bg-elevated text-ink border border-line-strong hover:bg-subtle disabled:text-faint",
  ghost: "text-ink hover:bg-accent-surface disabled:text-faint",
  quiet: "text-muted hover:text-ink hover:bg-accent-surface disabled:text-faint",
  danger:
    "bg-danger text-white hover:opacity-90 disabled:opacity-40 dark:text-app",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5 rounded-control",
  md: "h-8 px-3 text-sm gap-2 rounded-control",
  lg: "h-10 px-4 text-md gap-2 rounded-input",
};

export type ButtonProps = Omit<
  HTMLMotionProps<"button">,
  "children" | "ref"
> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Rendered before the label. Icons are decorative; the label carries meaning. */
  icon?: React.ReactNode;
  children?: React.ReactNode;
};

/**
 * Press compression is the product's core tactile signal: a control that
 * physically responds tells the user the system received the input, before any
 * result exists. It is 3% and 100ms — enough to feel, too small to delay.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      loading = false,
      icon,
      children,
      className,
      disabled,
      ...props
    },
    ref,
  ) {
    const isDisabled = disabled || loading;

    return (
      <motion.button
        ref={ref}
        type="button"
        disabled={isDisabled}
        // Read by the tactile layer: a primary or destructive press is a
        // commitment and gets a heavier feedback tone than an ordinary one.
        data-variant={variant}
        // Announce busy state rather than only showing a spinner.
        aria-busy={loading || undefined}
        whileTap={isDisabled ? undefined : { scale: 0.97 }}
        transition={SPRING.press}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap font-medium",
          "transition-colors duration-100",
          "disabled:cursor-not-allowed",
          // Focus ring sits outside the control so it survives dense layouts.
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          VARIANTS[variant],
          SIZES[size],
          className,
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          icon
        )}
        {children}
      </motion.button>
    );
  },
);

export type IconButtonProps = ButtonProps & {
  /** Required: an icon-only control must still name itself to a screen reader. */
  label: string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ label, size = "md", className, ...props }, ref) {
    const box = size === "sm" ? "size-7" : size === "lg" ? "size-10" : "size-8";
    return (
      <Button
        ref={ref}
        aria-label={label}
        size={size}
        className={cn("px-0", box, className)}
        {...props}
      />
    );
  },
);
