import Link from "next/link";

/**
 * The shell for every unauthenticated screen: signup, login, OTP, password
 * recovery. Deliberately calm rather than a marketing hero — the same
 * restraint as the rest of the product, applied to the first thing anyone
 * sees. A centred column rather than a split layout, because there is no
 * marketing content to fill a second pane with yet (see `app/page.tsx`).
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-app px-5 py-12">
      <div className="w-full max-w-sm">
        <Wordmark />
        <h1 className="mt-7 font-display text-3xl text-ink">{title}</h1>
        {description && (
          <p className="mt-2 text-md leading-relaxed text-muted">{description}</p>
        )}
        <div className="mt-8">{children}</div>
        {footer && (
          <div className="mt-7 text-center text-sm text-muted">{footer}</div>
        )}
      </div>
    </div>
  );
}

function Wordmark() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
    >
      <span
        className="flex size-7 items-center justify-center rounded-md bg-accent text-sm font-semibold text-accent-fg"
        aria-hidden
      >
        H
      </span>
      <span className="text-md font-medium text-ink">Humanoid</span>
    </Link>
  );
}
