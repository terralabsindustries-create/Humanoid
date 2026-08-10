import { cn } from "@/lib/utils/cn";

/**
 * The label / description / error wrapper shared by every form control in
 * auth and onboarding. Error text is reserved for a real validation failure —
 * never rendered speculatively — so its presence alone is enough for a screen
 * reader user to know something needs attention, without relying on colour.
 */
export function Field({
  label,
  description,
  error,
  htmlFor,
  required,
  className,
  children,
}: {
  label?: string;
  description?: string;
  error?: string | null;
  htmlFor?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
          {label}
          {required && (
            <span className="ml-0.5 text-danger" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {description && <p className="text-xs text-muted">{description}</p>}
      {children}
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
