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
