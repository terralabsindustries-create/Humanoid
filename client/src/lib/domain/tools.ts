/**
 * Tools and integrations logic that is not a screen.
 *
 * The distinction this module exists to keep straight is the one from arch §5:
 * an **Integration** is the connection, a **Tool** is one action that connection
 * exposes to the AI. Health belongs to the connection, consequence belongs to
 * the action, and reporting either in the other's terms is how a status page
 * ends up telling an operator that something is amber without telling them what
 * stopped working.
 *
 * Everything here is derivation over the two lists. Nothing writes: connecting
 * and disconnecting systems is not built, and this file does not pretend it is.
 */

import type {
  AIEmployee,
  AutonomyLevel,
  CapabilityId,
  EmployeeVersion,
  Integration,
  IntegrationStatus,
  Tool,
  ToolStatus,
} from "./types";

/**
 * Worst first, in both orderings.
 *
 * A working connection listed above a failing one is the specific failure mode
 * of every integrations page ever built: the thing you came to fix is below the
 * fold, under four rows of green.
 */
const INTEGRATION_ORDER: Record<IntegrationStatus, number> = {
  error: 0,
  degraded: 1,
  disconnected: 2,
  connected: 3,
};

const TOOL_ORDER: Record<ToolStatus, number> = {
  unavailable: 0,
  degraded: 1,
  available: 2,
};

export type ConnectedSystem = {
  integration: Integration;
  /** The actions it exposes, worst health first and busiest within that. */
  tools: Tool[];
  /**
   * Access granted on the connection that none of its actions asks for.
   *
   * Worth surfacing rather than hiding: a connection holding write access to
   * patient records for the sake of one read-only lookup is a standing risk
   * nobody chose, and it is invisible unless something compares the two lists.
   */
  unusedScopes: string[];
  requestsLast24h: number;
  failuresLast24h: number;
};

/**
 * Actions joined onto their connections.
 *
 * The join runs off `tool.integrationId` rather than `integration.toolIds`,
 * because the child holding the reference is how the API will shape it and how
 * a half-migrated list stays consistent — an action whose connection has been
 * removed simply disappears from the screen instead of appearing under it.
 */
export function connectedSystems(
  integrations: Integration[],
  tools: Tool[],
): ConnectedSystem[] {
  return [...integrations]
    .sort(
      (a, b) =>
        INTEGRATION_ORDER[a.status] - INTEGRATION_ORDER[b.status] ||
        a.name.localeCompare(b.name),
    )
    .map((integration) => {
      const owned = rankTools(
        tools.filter((tool) => tool.integrationId === integration.id),
      );
      const needed = new Set(owned.flatMap((tool) => tool.requiredScopes));

      return {
        integration,
        tools: owned,
        unusedScopes: integration.scopes.filter((scope) => !needed.has(scope)),
        requestsLast24h: owned.reduce((sum, tool) => sum + tool.requestsLast24h, 0),
        failuresLast24h: owned.reduce(
          (sum, tool) => sum + tool.failuresLast24h,
          0,
        ),
      };
    });
}

/** Worst health first, then the one being asked for most often. */
export function rankTools(tools: Tool[]): Tool[] {
  return [...tools].sort(
    (a, b) =>
      TOOL_ORDER[a.status] - TOOL_ORDER[b.status] ||
      b.requestsLast24h - a.requestsLast24h ||
      a.name.localeCompare(b.name),
  );
}

/** Actions the AI cannot rely on right now. */
export function failingTools(tools: Tool[]): Tool[] {
  return rankTools(tools.filter((tool) => tool.status !== "available"));
}

export type ToolGrant = {
  employee: AIEmployee;
  /** Granted in the version currently answering the phone. */
  live: boolean;
  /**
   * Granted in the draft. Kept separate from `live` rather than folded into a
   * single boolean because they answer different questions — "can it do this on
   * a call happening now" and "will it be able to when someone publishes" — and
   * a screen that conflates them will report an action as in use on the
   * strength of a change nobody has released.
   */
  draft: boolean;
};

/** Which employees have been granted an action, and in which version. */
export function grantsFor(toolId: string, employees: AIEmployee[]): ToolGrant[] {
  return employees
    .map((employee) => ({
      employee,
      live: employee.liveVersion?.grants.toolIds.includes(toolId) ?? false,
      draft: employee.draftVersion?.grants.toolIds.includes(toolId) ?? false,
    }))
    .filter((grant) => grant.live || grant.draft);
}

/**
 * Actions no employee can reach — exposed by the connection and granted to
 * nobody, in live or in draft.
 *
 * These are not a fault, and are not shown as one. They are the surface area a
 * connection is holding open for no current reason, which is the other half of
 * the scope conversation above.
 */
export function ungrantedTools(
  tools: Tool[],
  employees: AIEmployee[],
): Tool[] {
  return rankTools(
    tools.filter((tool) => grantsFor(tool.id, employees).length === 0),
  );
}

/**
 * The version that decides what an employee can reach today: the live one, or
 * the draft where nothing has been published yet. Reading grants off whichever
 * exists — rather than off the draft, which is the more recent — keeps every
 * derivation below describing the AI that is actually answering the phone.
 */
function effectiveVersion(employee: AIEmployee): EmployeeVersion | null {
  return employee.liveVersion ?? employee.draftVersion;
}

export type UnwiredCapability = {
  employee: AIEmployee;
  capabilityId: CapabilityId;
  autonomy: AutonomyLevel;
  /** Actions that would serve it, none of which this employee has been given. */
  candidates: Tool[];
};

/**
 * Capabilities an employee is authorised to use, that a connected system has an
 * action for, and that the employee has not been granted that action.
 *
 * This join is the reason Tools is a screen rather than a settings page. Nothing
 * else in the product can see both halves: Employees knows what the AI is
 * *allowed* to do and Integrations knows what it can *reach*, and an authority
 * matrix that says "Cancel appointments — asks a person first" reads as working
 * right up until someone notices no action behind it was ever granted.
 *
 * Three exclusions keep it from crying wolf. `observe` is skipped because a
 * capability the AI never uses needs nothing wired to it; hard-blocked ones are
 * skipped for the same reason and more firmly. And a capability that no action
 * anywhere serves is skipped entirely — answering from knowledge and
 * transferring a call are things the AI does by itself, and reporting them as
 * missing an integration would be noise that teaches people to ignore the list.
 */
export function unwiredCapabilities(
  employees: AIEmployee[],
  tools: Tool[],
): UnwiredCapability[] {
  const unwired: UnwiredCapability[] = [];

  for (const employee of employees) {
    const version = effectiveVersion(employee);
    if (!version) continue;

    const granted = new Set(version.grants.toolIds);

    for (const grant of version.authority) {
      if (grant.hardBlocked || grant.autonomy === "observe") continue;

      const candidates = tools.filter((tool) =>
        tool.capabilityIds.includes(grant.capabilityId),
      );
      if (candidates.length === 0) continue;
      if (candidates.some((tool) => granted.has(tool.id))) continue;

      unwired.push({
        employee,
        capabilityId: grant.capabilityId,
        autonomy: grant.autonomy,
        candidates: rankTools(candidates),
      });
    }
  }

  return unwired;
}

/** The name an employee is known by, from whichever version exists. */
export function employeeName(employee: AIEmployee): string {
  return effectiveVersion(employee)?.persona.name ?? "Unnamed";
}
