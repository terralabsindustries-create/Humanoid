import { Prisma } from "@prisma/client";
import { prisma } from "@/db/client.js";

/**
 * Append-only by convention: nothing in this codebase ever updates or
 * deletes an `AuditEvent` row after creating it.
 */
export async function recordAudit(input: {
  workspaceId?: string | null;
  actorType: "user" | "system";
  actorId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      workspaceId: input.workspaceId ?? null,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadataJson: input.metadata ?? {},
    },
  });
}
