import { prisma } from "@/db/client.js";
import { ApiError } from "@/lib/errors/api-error.js";

/**
 * Every workspace-scoped route calls this before touching workspace data.
 * Tenant isolation is enforced here, in application code backed by the
 * `workspace_memberships` row — never by trusting a client-supplied
 * workspace id alone (`architecture.md`: "Never rely on UI filtering for
 * tenant isolation").
 *
 * Returns a 404, not a 403, when the workspace doesn't exist or the caller
 * isn't a member — a 403 would confirm the workspace id is real, which is
 * itself information a non-member shouldn't get.
 */
export async function requireWorkspaceMember(
  userId: string,
  workspaceId: string,
): Promise<{ membershipRoleKey: string }> {
  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { role: true },
  });

  if (!membership || membership.status !== "active") {
    throw new ApiError("RESOURCE_NOT_FOUND", "Workspace not found.");
  }

  return { membershipRoleKey: membership.role.key };
}

/**
 * Membership plus a named permission.
 *
 * Membership alone is the wrong gate for anything a role deliberately does not
 * include: the frontend already hides spend from an Operator, and a check that
 * lived only there would make that a UI convention rather than a boundary —
 * the exact thing `architecture.md` says never to rely on. Callers that only
 * need tenant isolation keep using `requireWorkspaceMember`.
 *
 * `*` is the owner's wildcard, seeded in `roles-seed.ts`.
 */
export async function requireWorkspaceCapability(
  userId: string,
  workspaceId: string,
  capability: string,
): Promise<void> {
  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
  });

  if (!membership || membership.status !== "active") {
    throw new ApiError("RESOURCE_NOT_FOUND", "Workspace not found.");
  }

  const held = membership.role.rolePermissions.map((rp) => rp.permission.key);
  if (held.includes("*") || held.includes(capability)) return;

  // A 403 here, unlike the 404 above: the caller has already proved they
  // belong to this workspace, so there is nothing left to conceal, and
  // "you cannot see this" is the answer the screen is built to render.
  throw new ApiError("PERMISSION_DENIED", `This role does not include ${capability}.`);
}
