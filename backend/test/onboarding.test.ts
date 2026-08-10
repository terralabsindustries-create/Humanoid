import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, signUpAndVerify } from "./helpers.js";

describe("workspaces + onboarding", () => {
  let app: FastifyInstance;
  let cookie: string;

  beforeEach(async () => {
    app = await createTestApp();
    ({ cookie } = await signUpAndVerify(app, {
      name: "Jordan Ellis",
      email: "jordan@example.com",
      password: "password123",
    }));
  });

  async function createWorkspace() {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces",
      headers: { cookie },
      payload: {
        businessName: "Lumina Grand Hotel",
        website: "luminagrand.com",
        country: "United Kingdom",
        companySize: "51-200",
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().data.workspace.id as string;
  }

  it("creates an organization, workspace and owner membership together", async () => {
    const workspaceId = await createWorkspace();

    const meRes = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie } });
    const me = meRes.json().data;
    expect(me.workspaces).toHaveLength(1);
    expect(me.workspaces[0].workspace.id).toBe(workspaceId);
    expect(me.workspaces[0].role).toBe("owner");
    expect(me.workspaces[0].capabilities).toEqual(["*"]);
  });

  it("persists answers and resumes them", async () => {
    const workspaceId = await createWorkspace();

    await app.inject({
      method: "PATCH",
      url: `/api/v1/workspaces/${workspaceId}/onboarding/industry`,
      headers: { cookie },
      payload: { industryKey: "hospitality" },
    });

    await app.inject({
      method: "PUT",
      url: `/api/v1/workspaces/${workspaceId}/onboarding/answers/ai_name`,
      headers: { cookie },
      payload: { value: "ARIA" },
    });
    await app.inject({
      method: "PUT",
      url: `/api/v1/workspaces/${workspaceId}/onboarding/answers/escalation_triggers`,
      headers: { cookie },
      payload: { value: ["emergencies", "vip"] },
    });

    const getRes = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}/onboarding`,
      headers: { cookie },
    });
    const body = getRes.json().data;
    expect(body.session.industryKey).toBe("hospitality");
    expect(body.answers.ai_name).toBe("ARIA");
    expect(body.answers.escalation_triggers).toEqual(["emergencies", "vip"]);
  });

  it("clears answers when industry changes", async () => {
    const workspaceId = await createWorkspace();

    await app.inject({
      method: "PATCH",
      url: `/api/v1/workspaces/${workspaceId}/onboarding/industry`,
      headers: { cookie },
      payload: { industryKey: "hospitality" },
    });
    await app.inject({
      method: "PUT",
      url: `/api/v1/workspaces/${workspaceId}/onboarding/answers/room_count`,
      headers: { cookie },
      payload: { value: 120 },
    });

    await app.inject({
      method: "PATCH",
      url: `/api/v1/workspaces/${workspaceId}/onboarding/industry`,
      headers: { cookie },
      payload: { industryKey: "legal" },
    });

    const getRes = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}/onboarding`,
      headers: { cookie },
    });
    const body = getRes.json().data;
    expect(body.session.industryKey).toBe("legal");
    expect(body.answers).toEqual({});
  });

  it("creates a versioned, live AI employee on completion", async () => {
    const workspaceId = await createWorkspace();

    await app.inject({
      method: "PATCH",
      url: `/api/v1/workspaces/${workspaceId}/onboarding/industry`,
      headers: { cookie },
      payload: { industryKey: "hospitality" },
    });
    await app.inject({
      method: "PUT",
      url: `/api/v1/workspaces/${workspaceId}/onboarding/answers/ai_name`,
      headers: { cookie },
      payload: { value: "ARIA" },
    });
    await app.inject({
      method: "PUT",
      url: `/api/v1/workspaces/${workspaceId}/onboarding/answers/communication_style`,
      headers: { cookie },
      payload: { value: "warm_professional" },
    });
    await app.inject({
      method: "PUT",
      url: `/api/v1/workspaces/${workspaceId}/onboarding/answers/escalation_triggers`,
      headers: { cookie },
      payload: { value: ["emergencies", "vip"] },
    });

    const completeRes = await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/${workspaceId}/onboarding/complete`,
      headers: { cookie },
      payload: { aiEmployeeRoleName: "AI Concierge" },
    });
    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.json().data.workspace.industryKey).toBe("hospitality");

    const listRes = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}/ai-employees`,
      headers: { cookie },
    });
    const employees = listRes.json().data;
    expect(employees).toHaveLength(1);
    expect(employees[0].name).toBe("ARIA");
    expect(employees[0].roleName).toBe("AI Concierge");
    expect(employees[0].status).toBe("live");
    expect(employees[0].configurationVersions[0].behaviorJson).toEqual({
      communicationStyle: "warm_professional",
    });
    expect(employees[0].configurationVersions[0].escalationRulesJson).toEqual({
      triggers: ["emergencies", "vip"],
    });

    // Cannot complete what's already complete.
    const secondCompleteRes = await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/${workspaceId}/onboarding/complete`,
      headers: { cookie },
      payload: { aiEmployeeRoleName: "AI Concierge" },
    });
    expect(secondCompleteRes.statusCode).toBe(409);
  });

  it("refuses to complete onboarding with no industry chosen", async () => {
    const workspaceId = await createWorkspace();

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/${workspaceId}/onboarding/complete`,
      headers: { cookie },
      payload: { aiEmployeeRoleName: "AI Concierge" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("enforces tenant isolation — a non-member gets 404, not 403", async () => {
    const workspaceId = await createWorkspace();

    const { cookie: otherCookie } = await signUpAndVerify(app, {
      name: "Someone Else",
      email: "someone.else@example.com",
      password: "password123",
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}`,
      headers: { cookie: otherCookie },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("RESOURCE_NOT_FOUND");

    const onboardingRes = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}/onboarding`,
      headers: { cookie: otherCookie },
    });
    expect(onboardingRes.statusCode).toBe(404);
  });
});
