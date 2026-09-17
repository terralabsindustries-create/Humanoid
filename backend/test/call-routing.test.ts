import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/db/client.js";
import { resolveEmployeeForCall } from "../src/modules/telephony/ai-receptionist.js";

/**
 * Which business answers the phone.
 *
 * This is the bug that is invisible when it happens: the call connects, a
 * confident voice picks up, and it belongs to somebody else's company. It was
 * hit for real — a tenant onboarded a day later silently took over the line,
 * because "most recently configured employee" was the only rule.
 */
describe("call routing", () => {
  async function makeTenant(name: string, opts: { phoneNumber?: string; employee: string }) {
    const org = await prisma.organization.create({ data: { name, slug: name.toLowerCase().replace(/\W+/g, "-") } });
    const workspace = await prisma.workspace.create({
      data: {
        organizationId: org.id,
        name,
        slug: `${name.toLowerCase().replace(/\W+/g, "-")}-ws`,
        ...(opts.phoneNumber ? { phoneNumber: opts.phoneNumber } : {}),
      },
    });
    const employee = await prisma.aiEmployee.create({
      data: { workspaceId: workspace.id, name: opts.employee, roleName: "Receptionist" },
    });
    const version = await prisma.aiEmployeeConfigurationVersion.create({
      data: { aiEmployeeId: employee.id, versionNumber: 1, behaviorJson: {}, escalationRulesJson: {} },
    });
    await prisma.aiEmployee.update({
      where: { id: employee.id },
      data: { currentConfigurationVersionId: version.id },
    });
    return { workspaceId: workspace.id, employeeId: employee.id };
  }

  let owner: { workspaceId: string };

  beforeEach(async () => {
    owner = await makeTenant("Lumina Hotel", { phoneNumber: "+918590740343", employee: "Arsha" });
    // Onboarded afterwards, so it is the "most recent" employee — the exact
    // shape that used to steal the call.
    await makeTenant("Vance and Rowe", { employee: "Solace" });
  });

  it("routes to the workspace that owns the dialled number", async () => {
    const routed = await resolveEmployeeForCall("+918590740343");
    expect(routed?.basis).toBe("phone_number");
    expect(routed?.employee.employeeName).toBe("Arsha");
    expect(routed?.employee.workspaceId).toBe(owner.workspaceId);
  });

  it("is not stolen by a tenant that onboarded more recently", async () => {
    // Touching the newer employee makes it the newest by updatedAt.
    await prisma.aiEmployee.updateMany({ where: { name: "Solace" }, data: { roleName: "Intake" } });

    const routed = await resolveEmployeeForCall("+918590740343");
    expect(routed?.employee.employeeName).toBe("Arsha");
  });

  it("falls back to the most recent employee for an unassigned number, and says so", async () => {
    const routed = await resolveEmployeeForCall("+15550000000");
    expect(routed?.basis).toBe("most_recent");
    expect(routed?.employee.employeeName).toBe("Solace");
  });

  it("returns null when no employee is configured at all", async () => {
    await prisma.aiEmployee.updateMany({ data: { currentConfigurationVersionId: null } });
    expect(await resolveEmployeeForCall("+918590740343")).toBeNull();
  });

  it("keeps a number attached to one workspace only", async () => {
    await expect(
      makeTenant("Northwind", { phoneNumber: "+918590740343", employee: "Wren" }),
    ).rejects.toThrow();
  });
});
