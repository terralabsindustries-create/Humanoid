import { Skeleton } from "@/components/primitives/skeleton";

/**
 * Route-level loading.
 *
 * Deliberately quiet: the shell is already on screen and interactive, so this
 * only stands in for the surface being navigated to. It mirrors the common page
 * rhythm — an eyebrow, a heading, then bands — so the layout does not jump when
 * content lands.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <span role="status" aria-live="polite" className="sr-only">
        Loading
      </span>
      <Skeleton className="h-2.5 w-28" />
      <Skeleton className="mt-3 h-9 w-72" />
      <div className="mt-9 space-y-8">
        {[0, 1, 2].map((band) => (
          <div key={band} className="border-t border-line pt-5">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="mt-3.5 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-3/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
