import type { PrismaClient } from "@prisma/client";

/**
 * System roles and permissions. Keys mirror the frontend's `RolePreset`
 * (`client/src/lib/domain/types.ts`) and the capability strings already
 * exercised by the Northgate Health fixture. Shared between `prisma/seed.ts`
 * (real dev/prod seeding) and the test suite (`test/setup.ts` reseeds this
 * after truncating between tests) so the two can never drift apart.
 */
export const PERMISSIONS = [
  "*",
  "conversation.read",
  "conversation.takeover",
  "conversation.coach",
  "conversation.transfer",
  "recording.listen",
  "record.read",
  "record.edit",
  "issue.read",
  "issue.resolve",
  "approval.grant",
  "employee.read",
  "employee.edit",
  "employee.publish",
  "knowledge.read",
  "knowledge.edit",
  "procedure.read",
  "procedure.edit",
  "tool.read",
  "tool.configure",
  "simulation.run",
  "audit.read",
  "compliance.read",
  "retention.manage",
  "people.manage",
  "pii.reveal",
  "workspace.manage",
  "billing.read",
  "channel.manage",
] as const;

export const ROLES: Record<string, { name: string; description: string; permissions: string[] }> = {
  owner: {
    name: "Owner",
    description: "Full control over the workspace.",
    permissions: ["*"],
  },
  operator: {
    name: "Operator",
    description: "Runs day-to-day operations: conversations, records, escalations.",
    permissions: [
      "conversation.read",
      "conversation.takeover",
      "conversation.coach",
      "conversation.transfer",
      "recording.listen",
      "record.read",
      "record.edit",
      "issue.read",
      "issue.resolve",
      "approval.grant",
    ],
  },
  builder: {
    name: "Builder",
    description: "Configures AI employees, knowledge, procedures and tools.",
    permissions: [
      "conversation.read",
      "employee.read",
      "employee.edit",
      "employee.publish",
      "knowledge.read",
      "knowledge.edit",
      "procedure.read",
      "procedure.edit",
      "tool.read",
      "tool.configure",
      "simulation.run",
      "issue.read",
      "issue.resolve",
    ],
  },
  governor: {
    name: "Governor",
    description: "Compliance, audit, billing and workspace governance.",
    permissions: [
      "conversation.read",
      "audit.read",
      "compliance.read",
      "retention.manage",
      "people.manage",
      "recording.listen",
      "pii.reveal",
      "workspace.manage",
      "billing.read",
      "channel.manage",
    ],
  },
};

export async function seedRolesAndPermissions(prisma: PrismaClient): Promise<void> {
  await prisma.permission.createMany({
    data: PERMISSIONS.map((key) => ({ key })),
    skipDuplicates: true,
  });

  for (const [key, role] of Object.entries(ROLES)) {
    const existing = await prisma.role.findFirst({ where: { workspaceId: null, key } });
    const created = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: { name: role.name, description: role.description },
        })
      : await prisma.role.create({
          data: {
            workspaceId: null,
            key,
            name: role.name,
            description: role.description,
            isSystem: true,
          },
        });

    const permissions = await prisma.permission.findMany({
      where: { key: { in: role.permissions } },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: created.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: created.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }
}
