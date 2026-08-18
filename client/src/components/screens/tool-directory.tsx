"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { qk, service } from "@/lib/services";
import { useScope } from "@/lib/store/scope";
import { useLexicon } from "@/components/providers/app-providers";
import { Badge, Status, StatusPill } from "@/components/primitives/status";
import { EmptyState, ErrorState } from "@/components/primitives/empty-state";
import {
  LoadingAnnouncement,
  Skeleton,
} from "@/components/primitives/skeleton";
import {
  AUTONOMY_LABEL,
  INTEGRATION_STATUS_LABEL,
  INTEGRATION_STATUS_TONE,
  TOOL_EFFECT_LABEL,
  TOOL_STATUS_LABEL,
  TOOL_STATUS_SHORT,
  TOOL_STATUS_TONE,
} from "@/lib/domain/labels";
import { capabilityLabel } from "@/lib/domain/capabilities";
import {
  connectedSystems,
  employeeName,
  failingTools,
  grantsFor,
  ungrantedTools,
  unwiredCapabilities,
  type ConnectedSystem,
  type UnwiredCapability,
} from "@/lib/domain/tools";
import { relativeAgo, relativeLong } from "@/lib/utils/time";
import { lower } from "@/lib/lexicon";
import type { AIEmployee, ReviewIssue, Tool } from "@/lib/domain/types";

/**
 * Tools & integrations.
 *
 * The organising decision, and the reason this is one screen rather than a
 * status page: an **integration** is a connection and a **tool** is one action
 * that connection exposes to the AI (arch §5). Health belongs to the
 * connection; consequence belongs to the action. "Dentally is amber" is not
 * something anyone can act on — "the AI cannot find appointment times, and it
 * failed 12 times out of 47 this morning" is the same fact said in a way that
 * leads somewhere.
 *
 * So the page is a list of connections, each opened up into the actions it
 * offers, and the rail answers the three questions that need the whole
 * workspace to answer at once: what is the AI unable to do right now, what is
 * it authorised to do with nothing wired up to do it, and what access are we
 * holding open for no current reason.
 *
 * Nothing here writes. Connecting a system needs a credential and consent flow
 * that does not exist, and granting an action to an employee happens on the
 * employee — so this surface reports and links, and does not grow a button
 * whose only honest label would be "does nothing yet".
 */
export function ToolDirectory() {
  const scope = useScope();
  const lexicon = useLexicon();

  // Connections and actions are workspace assets (§3.1) — an employee is
  // granted them, so they are not filtered by the location scope the way a
  // conversation list is. Review issues are, which is why only that one is
  // scoped: the rail must agree with what Review itself would show.
  const integrationsQuery = useQuery({
    queryKey: qk.integrations,
    queryFn: () => service.listIntegrations(),
  });
  const toolsQuery = useQuery({
    queryKey: qk.tools,
    queryFn: () => service.listTools(),
  });
  const employeesQuery = useQuery({
    queryKey: qk.employees,
    queryFn: () => service.listEmployees(),
  });
  const issuesQuery = useQuery({
    queryKey: qk.issues(scope),
    queryFn: () => service.listReviewIssues(scope),
  });

  const integrations = useMemo(
    () => integrationsQuery.data ?? [],
    [integrationsQuery.data],
  );
  const tools = useMemo(() => toolsQuery.data ?? [], [toolsQuery.data]);
  const employees = useMemo(
    () => employeesQuery.data ?? [],
    [employeesQuery.data],
  );

  const systems = useMemo(
    () => connectedSystems(integrations, tools),
    [integrations, tools],
  );
  const failing = useMemo(() => failingTools(tools), [tools]);
  const unwired = useMemo(
    () => unwiredCapabilities(employees, tools),
    [employees, tools],
  );
  const ungranted = useMemo(
    () => ungrantedTools(tools, employees),
    [tools, employees],
  );

  /**
   * Open issues Review already holds about a connected system failing.
   *
   * Matched on cause rather than on a tool id, because there is no tool id on
   * an issue to match — inventing the join would put a specific action's name
   * on an issue that may be about a different one. The section says what it
   * actually knows: Review is already tracking a system failure, here it is.
   */
  const toolIssues = useMemo(
    () =>
      (issuesQuery.data ?? []).filter(
        (issue) => issue.cause === "tool_failure" && issue.status !== "resolved",
      ),
    [issuesQuery.data],
  );

  const loading =
    integrationsQuery.isPending ||
    toolsQuery.isPending ||
    employeesQuery.isPending;

  // One failed request out of four should not blank a screen that can still
  // answer most of its questions, so only the two that carry the page fail it.
  if (integrationsQuery.isError || toolsQuery.isError) {
    return (
      <Page rail={null}>
        <Header />
        <ErrorState
          title="Could not load your connected systems"
          detail="This list did not respond. It is a reporting failure only — the connections themselves are unaffected, and calls in progress are still using them."
          onRetry={() => {
            integrationsQuery.refetch();
            toolsQuery.refetch();
          }}
        />
      </Page>
    );
  }

  return (
    <Page
      rail={
        loading ? null : (
          <Rail
            failing={failing}
            unwired={unwired}
            ungranted={ungranted}
            issues={toolIssues}
          />
        )
      }
    >
      <Header
        systems={systems}
        tools={tools}
        failing={failing}
        loading={loading}
      />

      <div className="mt-7 space-y-4">
        {loading ? (
          <SystemsSkeleton />
        ) : systems.length === 0 ? (
          <EmptyState
            title="No systems connected yet"
            description={`Your ${lower(lexicon.employee.one)} can already answer the phone, understand what is being asked and take a message. Connecting a diary, a records system or a messaging provider is what lets it finish the job — book the ${lower(lexicon.visit.one)} rather than promise that someone will call back. That flow is not built yet.`}
          />
        ) : (
          systems.map((system) => (
            <SystemPanel
              key={system.integration.id}
              system={system}
              employees={employees}
            />
          ))
        )}
      </div>

      {!loading && systems.length > 0 && (
        <p className="mt-6 max-w-prose text-xs text-faint">
          Connecting a new system is not built yet — it needs a credential and
          consent flow that nothing on this page could honestly stand in for.
          Everything above is read-only.
        </p>
      )}
    </Page>
  );
}

/**
 * Left-anchored with the width above 1280px going to the rail, like Review.
 * The rail is not a summary of the list beside it: every section in it is a cut
 * that needs the whole workspace — actions, authority and grants together — and
 * so cannot be shown against any single connection.
 */
function Page({
  children,
  rail,
}: {
  children: React.ReactNode;
  rail: React.ReactNode;
}) {
  return (
    <div className="px-5 py-8 sm:px-8 sm:py-12 xl:px-10">
      <div className="flex gap-10 2xl:gap-14">
        <div className="min-w-0 max-w-[52rem] flex-1">{children}</div>
        {rail && (
          <aside className="hidden w-[19rem] shrink-0 xl:block">{rail}</aside>
        )}
      </div>
    </div>
  );
}

function Header({
  systems = [],
  tools = [],
  failing = [],
  loading = false,
}: {
  systems?: ConnectedSystem[];
  tools?: Tool[];
  failing?: Tool[];
  loading?: boolean;
}) {
  const lexicon = useLexicon();

  return (
    <header>
      <p className="font-mono text-2xs tracking-wide text-faint uppercase">
        Workspace assets
      </p>
      <h1 className="mt-1.5 font-display text-3xl text-ink">
        Tools &amp; integrations
      </h1>

      {!loading && (
        <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">
          {systems.length === 0 ? (
            <>Nothing is connected to this workspace yet.</>
          ) : (
            <>
              <span className="font-medium text-ink tabular">
                {systems.length}
              </span>{" "}
              connected {systems.length === 1 ? "system" : "systems"}{" "}
              {systems.length === 1 ? "exposes" : "expose"}{" "}
              <span className="font-medium text-ink tabular">
                {tools.length}
              </span>{" "}
              {tools.length === 1 ? "action" : "actions"} to your{" "}
              {lower(lexicon.employee.many)}.{" "}
              {failing.length === 0 ? (
                <>Every one of them is working.</>
              ) : (
                <>
                  <span className="font-medium text-ink tabular">
                    {failing.length}
                  </span>{" "}
                  {failing.length === 1 ? "is" : "are"} not working properly
                  right now — a granted action that fails is a promise the AI
                  has already made on a call.
                </>
              )}
            </>
          )}
        </p>
      )}
    </header>
  );
}

/**
 * One connection, opened up.
 *
 * The connection's own header carries health and when it was last checked; the
 * rows below carry what it lets the AI do. The scopes sit at the bottom rather
 * than the top because they are the answer to a question people ask second —
 * "what did we hand over to get this?" — and putting an access list above the
 * actions buries the actions under it.
 */
function SystemPanel({
  system,
  employees,
}: {
  system: ConnectedSystem;
  employees: AIEmployee[];
}) {
  const { integration, tools, unusedScopes, requestsLast24h, failuresLast24h } =
    system;

  return (
    <section
      aria-label={integration.name}
      className="overflow-hidden rounded-panel border border-line bg-elevated"
    >
      <header className="border-b border-line px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
          <h2 className="text-md font-medium text-ink">{integration.name}</h2>
          <StatusPill tone={INTEGRATION_STATUS_TONE[integration.status]}>
            {INTEGRATION_STATUS_LABEL[integration.status]}
          </StatusPill>
        </div>

        <p className="mt-1 text-xs text-muted">
          {integration.vendor !== integration.name && (
            <>{integration.vendor} · </>
          )}
          <span title={relativeLong(integration.lastCheckedAt)}>
            checked {relativeAgo(integration.lastCheckedAt)}
          </span>
          {/*
            "Requests", never "calls". In this product a call is a person on
            the phone, and a connection header reading "78 calls in 24h" beside
            a live-call counter in the top bar is a collision that costs an
            operator a second every time they read it.
          */}
          {requestsLast24h > 0 && (
            <>
              {" · "}
              <span className="tabular">{requestsLast24h}</span> request
              {requestsLast24h === 1 ? "" : "s"} in 24h
              {failuresLast24h > 0 && (
                <>
                  , <span className="tabular">{failuresLast24h}</span> failed
                </>
              )}
            </>
          )}
        </p>

        {/*
          The vendor's own words, verbatim. Summarising an integration error is
          how "request timed out after 8s" becomes "connection issue" and stops
          being the thing an engineer can act on.
        */}
        {integration.error && (
          <p
            role="alert"
            className="mt-2.5 rounded-control bg-danger-surface px-2.5 py-1.5 font-mono text-2xs text-danger"
          >
            {integration.error}
          </p>
        )}
      </header>

      {tools.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted sm:px-5">
          This connection exposes no actions, so nothing the AI does depends on
          it.
        </p>
      ) : (
        <ul>
          {tools.map((tool) => (
            <li key={tool.id}>
              <ToolRow tool={tool} employees={employees} />
            </li>
          ))}
        </ul>
      )}

      <footer className="border-t border-line bg-subtle/40 px-4 py-3 sm:px-5">
        <h3 className="font-mono text-2xs tracking-wide text-faint uppercase">
          Access granted
        </h3>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {integration.scopes.map((scope) => (
            <li key={scope}>
              <Badge mono>{scope}</Badge>
            </li>
          ))}
        </ul>
        {unusedScopes.length > 0 && (
          <p className="mt-2 max-w-prose text-2xs text-muted">
            No action here asks for{" "}
            <span className="font-mono">{unusedScopes.join(", ")}</span>.
            Access granted and unused is still access — worth removing at the
            other end rather than leaving open.
          </p>
        )}
      </footer>
    </section>
  );
}

/**
 * One action.
 *
 * Read down the row: what it does, whether it only looks or actually changes
 * something, what authority it serves, how hard it is being worked, and who is
 * allowed to use it. The last of those is the one nothing else in the product
 * shows — an action can be perfectly healthy and reachable by nobody.
 */
function ToolRow({
  tool,
  employees,
}: {
  tool: Tool;
  employees: AIEmployee[];
}) {
  const lexicon = useLexicon();
  const grants = grantsFor(tool.id, employees);

  // Capability names stay in their own casing and sit behind a colon: they are
  // named things an operator will also see on the authority matrix, and
  // lower-casing them mid-sentence makes "serves book appointments" read as a
  // verb phrase about this row rather than as the name of a capability.
  const serves = tool.capabilityIds
    .map((id) => capabilityLabel(id, lexicon))
    .join(", ");

  return (
    <div
      className={cn(
        "border-b border-line px-4 py-3.5 last:border-b-0 sm:px-5",
        // The tint says "look here" and the status label says why, so the
        // colour is never the only channel carrying it (rule 3).
        tool.status !== "available" && "bg-warning-surface/40",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-ink">{tool.name}</span>
        <Status tone={TOOL_STATUS_TONE[tool.status]} className="text-2xs">
          {TOOL_STATUS_SHORT[tool.status]}
        </Status>
      </div>

      <p className="mt-0.5 max-w-prose text-xs text-muted">
        {tool.description}
      </p>

      <p className="mt-2 text-2xs text-faint">
        {TOOL_EFFECT_LABEL[tool.effect]}
        {serves && <> · serves: {serves}</>}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-mono text-2xs text-faint tabular">
          {tool.requestsLast24h === 0 ? (
            <>not used in 24h</>
          ) : (
            <>
              {tool.requestsLast24h} in 24h
              {tool.failuresLast24h > 0 && <> · {tool.failuresLast24h} failed</>}
              {tool.lastUsedAt && <> · last {relativeAgo(tool.lastUsedAt)}</>}
            </>
          )}
        </span>

        {grants.length === 0 ? (
          <Badge>Granted to nobody</Badge>
        ) : (
          grants.map((grant) => (
            <Badge key={grant.employee.id}>
              {employeeName(grant.employee)}
              {!grant.live && grant.draft && " · draft only"}
            </Badge>
          ))
        )}
      </div>

      {tool.error && (
        <p
          role="alert"
          className="mt-2.5 rounded-control bg-danger-surface px-2.5 py-1.5 font-mono text-2xs text-danger"
        >
          {tool.error}
        </p>
      )}
    </div>
  );
}

function Rail({
  failing,
  unwired,
  ungranted,
  issues,
}: {
  failing: Tool[];
  unwired: UnwiredCapability[];
  ungranted: Tool[];
  issues: ReviewIssue[];
}) {
  const lexicon = useLexicon();

  if (
    failing.length === 0 &&
    unwired.length === 0 &&
    ungranted.length === 0 &&
    issues.length === 0
  ) {
    return null;
  }

  return (
    <div className="sticky top-8 space-y-7">
      {failing.length > 0 && (
        <RailSection
          label="Not working properly"
          note="Named as the thing the AI cannot rely on, because that is what a caller experiences."
        >
          <ul className="space-y-2.5">
            {failing.map((tool) => (
              <li key={tool.id}>
                <p className="text-xs font-medium text-ink">{tool.name}</p>
                <p className="mt-0.5 text-2xs text-muted">
                  {TOOL_STATUS_LABEL[tool.status]}
                  {tool.failuresLast24h > 0 && (
                    <>
                      {" — "}
                      <span className="tabular">{tool.failuresLast24h}</span> of{" "}
                      <span className="tabular">{tool.requestsLast24h}</span>{" "}
                      attempts failed in 24h
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </RailSection>
      )}

      {issues.length > 0 && (
        <RailSection
          label="Already in Review"
          note="Review holds the fix. This surface holds the evidence."
        >
          <ul className="space-y-1.5">
            {issues.map((issue) => (
              <li key={issue.id}>
                <Link
                  href={`/review/${issue.id}`}
                  className={cn(
                    "group flex items-start gap-1.5 rounded-control px-1 py-0.5 -mx-1",
                    "transition-colors hover:bg-subtle",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
                  )}
                >
                  <span className="min-w-0 flex-1 text-xs text-ink">
                    {issue.title}
                  </span>
                  <ArrowUpRight
                    className="mt-px size-3 shrink-0 text-faint transition-colors group-hover:text-muted"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </RailSection>
      )}

      {unwired.length > 0 && (
        <RailSection
          label="Authorised, not connected"
          note="A connected system has an action for each of these, and the employee has not been granted it. Where it manages without one it is doing the job in conversation; where it cannot, it escalates."
        >
          <ul className="space-y-2.5">
            {unwired.map((gap) => (
              <UnwiredRow key={`${gap.employee.id}-${gap.capabilityId}`} gap={gap} />
            ))}
          </ul>
        </RailSection>
      )}

      {ungranted.length > 0 && (
        <RailSection
          label="Granted to nobody"
          note={`${ungranted.length === 1 ? "This action is" : "These actions are"} exposed by a connection and reachable by no ${lower(lexicon.employee.one)}. Not a fault — surface area held open for no current reason.`}
        >
          <ul className="space-y-1">
            {ungranted.map((tool) => (
              <li key={tool.id} className="text-xs text-muted">
                {tool.name}
              </li>
            ))}
          </ul>
        </RailSection>
      )}
    </div>
  );
}

function UnwiredRow({ gap }: { gap: UnwiredCapability }) {
  const lexicon = useLexicon();

  return (
    <li>
      <p className="text-xs font-medium text-ink">
        {capabilityLabel(gap.capabilityId, lexicon)}
      </p>
      <p className="mt-0.5 text-2xs text-muted">
        {employeeName(gap.employee)} · {lower(AUTONOMY_LABEL[gap.autonomy])}
      </p>
      <p className="mt-0.5 text-2xs text-faint">
        {gap.candidates.map((tool) => tool.name).join(", ")} would do it
      </p>
    </li>
  );
}

function RailSection({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-2.5 font-mono text-2xs tracking-wide text-faint uppercase">
        {label}
      </h2>
      {children}
      {note && <p className="mt-2 text-2xs text-faint">{note}</p>}
    </div>
  );
}

function SystemsSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <LoadingAnnouncement label="Loading connected systems" />
      {[0, 1].map((panel) => (
        <div
          key={panel}
          className="overflow-hidden rounded-panel border border-line bg-elevated"
        >
          <div className="border-b border-line px-5 py-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-2 h-3 w-56" />
          </div>
          {[0, 1].map((row) => (
            <div key={row} className="border-b border-line px-5 py-4 last:border-b-0">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="mt-2 h-3 w-3/4" />
              <Skeleton className="mt-2 h-3 w-1/3" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
