import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6">
      <p className="font-mono text-2xs tracking-wide text-faint uppercase">
        404
      </p>
      <h1 className="mt-2 font-display text-3xl text-ink">
        There is nothing at this address
      </h1>
      <p className="mt-3 text-md text-muted">
        The link may be from an older version of the workspace, or the surface
        may have moved.
      </p>
      <Link
        href="/today"
        className="mt-6 self-start text-sm font-medium text-ink underline underline-offset-4 hover:text-muted"
      >
        Back to today
      </Link>
    </div>
  );
}
