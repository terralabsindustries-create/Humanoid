import { prisma } from "@/db/client.js";
import { ApiError } from "@/lib/errors/api-error.js";

export async function listAiEmployees(workspaceId: string) {
  return prisma.aiEmployee.findMany({
    where: { workspaceId },
    include: { configurationVersions: { orderBy: { versionNumber: "desc" }, take: 1 } },
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
