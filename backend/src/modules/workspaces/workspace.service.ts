import { prisma } from "@/db/client.js";
import { ApiError } from "@/lib/errors/api-error.js";
import { recordAudit } from "@/lib/audit.js";
import { slugWithSuffix } from "@/lib/slug.js";
import type { Workspace } from "@prisma/client";

export type OrganizationInfo = {
  businessName: string;
  website: string;
  country: string;
  companySize: string;
};

async function getOwnerRoleId(): Promise<string> {
  const role = await prisma.role.findFirst({ where: { workspaceId: null, key: "owner" } });
  if (!role) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "System roles are not seeded. Run the database seed before using the API.",
    );
  }
  return role.id;
}

/**
 * The "organization setup" onboarding step. One request creates the
 * organization, its workspace, the caller's owner membership, and an
 * in-progress onboarding session — all four exist for exactly the same
 * reason and none of them makes sense without the others.
 */
export async function createWorkspaceWithOnboarding(
  userId: string,
  input: OrganizationInfo,
): Promise<{ workspace: Workspace; onboardingSessionId: string }> {
  const ownerRoleId = await getOwnerRoleId();

  const result = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: input.businessName, slug: slugWithSuffix(input.businessName) },
    });

    const workspace = await tx.workspace.create({
      data: {
        organizationId: organization.id,
        name: input.businessName,
        slug: slugWithSuffix(input.businessName),
        settingsJson: {},
      },
    });

    await tx.workspaceMembership.create({
      data: { workspaceId: workspace.id, userId, roleId: ownerRoleId },
    });

    const onboardingSession = await tx.onboardingSession.create({
      data: {
        workspaceId: workspace.id,
        status: "in_progress",
        organizationJson: input,
      },
    });

    return { workspace, onboardingSessionId: onboardingSession.id };
  });

  await recordAudit({
    workspaceId: result.workspace.id,
    actorType: "user",
    actorId: userId,
    action: "workspace.created",
    resourceType: "workspace",
    resourceId: result.workspace.id,
  });

  return result;
}

export async function getWorkspace(workspaceId: string): Promise<Workspace> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) throw new ApiError("RESOURCE_NOT_FOUND", "Workspace not found.");
  return workspace;
}

export async function updateOrganizationInfo(
  workspaceId: string,
  input: Partial<OrganizationInfo>,
): Promise<Workspace> {
  const session = await prisma.onboardingSession.findUnique({ where: { workspaceId } });
  const nextOrganizationJson = {
    ...((session?.organizationJson as Record<string, unknown> | undefined) ?? {}),
    ...input,
  };

  if (session) {
    await prisma.onboardingSession.update({
      where: { workspaceId },
      data: { organizationJson: nextOrganizationJson },
    });
  }

  return prisma.workspace.update({
    where: { id: workspaceId },
    data: input.businessName ? { name: input.businessName } : {},
  });
}

export async function listMyWorkspaces(userId: string) {
  const memberships = await prisma.workspaceMembership.findMany({
    where: { userId, status: "active" },
    include: {
      workspace: true,
      role: { include: { rolePermissions: { include: { permission: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => ({
    workspace: m.workspace,
    role: m.role.key,
    // Resolved here rather than left to the frontend to re-derive from a
    // role name — the permission set behind "owner" is server-owned data,
    // not a constant worth duplicating client-side.
    capabilities: m.role.rolePermissions.map((rp) => rp.permission.key),
  }));
}
