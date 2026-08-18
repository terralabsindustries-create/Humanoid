import { Suspense } from "react";
import { PartyDirectory } from "@/components/screens/party-directory";
import { Skeleton } from "@/components/primitives/skeleton";

/**
 * The title is deliberately the neutral word. Metadata is resolved on the
 * server, where this workspace's lexicon is not known — the surface itself
 * renders the industry's term ("Patients", "Guests") the moment it mounts.
 */
export const metadata = { title: "Customers · Humanoid" };

export default function Page() {
  return (
    // Selection lives in the query string, so the tree below reads
    // `useSearchParams` and needs a boundary to stream past on the server.
    <Suspense fallback={<DirectoryFallback />}>
      <PartyDirectory />
    </Suspense>
  );
}

function DirectoryFallback() {
  return (
    <div className="flex h-full min-h-0" aria-busy>
      <div className="w-full px-5 pt-8 sm:px-6 lg:w-[21rem] lg:shrink-0 lg:border-r lg:border-line xl:w-[23rem]">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-3 h-3.5 w-52" />
        <Skeleton className="mt-4 h-9 w-full" />
      </div>
    </div>
  );
}
