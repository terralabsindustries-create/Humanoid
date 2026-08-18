import { prisma } from "@/db/client.js";
import { ApiError } from "@/lib/errors/api-error.js";

/**
 * Every version, not just the newest.
 *
 * A roster has to distinguish "this one is live" from "this one has a change
 * waiting", and those are two different versions — `take: 1` returns whichever
 * is numbered higher and leaves the caller unable to tell which case it is
 * looking at. Versions are few and small per employee, so the whole set is
 * cheaper than the second request the caller would otherwise have to make.
 */
export async function listAiEmployees(workspaceId: string) {
  return prisma.aiEmployee.findMany({
    where: { workspaceId },
    include: { configurationVersions: { orderBy: { versionNumber: "desc" } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function getAiEmployee(workspaceId: string, employeeId: string) {
  const employee = await prisma.aiEmployee.findFirst({
    where: { id: employeeId, workspaceId },
    include: { configurationVersions: { orderBy: { versionNumber: "desc" } } },
  });
  if (!employee) throw new ApiError("RESOURCE_NOT_FOUND", "AI employee not found.");
  return employee;
}
