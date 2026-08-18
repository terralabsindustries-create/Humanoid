import type { AIEmployee, EmployeeStatus, EmployeeVersion } from "@/lib/domain/types";
import * as api from "@/lib/services/http/ai-employees";
import { HttpError } from "@/lib/services/http/client";
import { getDomainPack, type DomainPack } from "./registry";
import { STANDARD_AI_QUESTION_IDS, packOptionLabel, packOptionLabels } from "./shared";
import type { IndustryPackId } from "@/lib/lexicon";

/**
 * Bridges the real AI-employee backend (`backend/src/modules/ai-employees`) to
 * the `AIEmployee` shape the roster and detail screens render.
 *
 * This is the other half of what onboarding produces. Onboarding writes an
 * `AiEmployee` and a versioned configuration; the phone line reads it
 * (`backend/src/modules/telephony/ai-receptionist.ts`) and speaks from it. What
 * it does *not* write is an authority matrix, a set of grants, a voice, or a
 * deployment record — none of those surfaces exist yet. So every one of them is
 * left empty here rather than invented, exactly as `real-employees`' sibling
 * does for conversations, and the screens say plainly that nothing has been
 * granted. See rule 13 in the root CLAUDE.md.
 *
 * The two configured facts onboarding *does* capture — a communication style
 * and a set of escalation triggers — are stored as option ids, and are resolved
 * back into the words the business saw through the pack that asked the
 * question. That keeps the industry knowledge in `lib/domains/` (rule 10) and
 * hands the screens plain prose.
 */

/**
 * The backend's `status` is a free string; only the three values it actually
 * writes are mapped. Anything else becomes `draft` rather than being cast — an
 * unrecognised status must not render as live, because "live" is the claim that
 * this thing is answering a phone right now.
 */
function mapStatus(status: string): EmployeeStatus {
  if (status === "live") return "live";
  if (status === "paused") return "paused";
  return "draft";
}

function mapVersion(
  version: api.ApiAiEmployeeConfigurationVersion,
  employee: api.ApiAiEmployee,
  pack: DomainPack | null,
): EmployeeVersion {
  const styleId = version.behaviorJson?.communicationStyle ?? null;
  // Typed as an array, but it is a JSON column: a row written by anything other
  // than the onboarding transaction can hold `{}`, and a `.map` on undefined
  // would take the whole roster down with it.
  const triggerIds = Array.isArray(version.escalationRulesJson?.triggers)
    ? version.escalationRulesJson.triggers
    : [];

  return {
    id: version.id,
    version: version.versionNumber,
    state: version.status === "live" ? "live" : "draft",
    persona: {
      name: employee.name,
      role: employee.roleName,
      // The voice line composes its own greeting from the business name and
      // this employee's name when it answers; no script is stored on the
      // version. Reproducing that template here would put a second copy of it
      // in the frontend, free to drift from the one callers actually hear.
      greeting: null,
      style: pack ? packOptionLabel(pack, STANDARD_AI_QUESTION_IDS.style, styleId) : null,
      voiceId: null,
      languages: [employee.defaultLanguage],
      warmth: null,
      formality: null,
      pace: null,
    },
    grants: {
      knowledgeCollectionIds: [],
      procedureIds: [],
      toolIds: [],
      policyIds: [],
    },
    authority: [],
    escalationTriggers: pack
      ? packOptionLabels(pack, STANDARD_AI_QUESTION_IDS.escalation, triggerIds)
      : [],
    publishedAt: version.deployedAt,
    publishedBy: version.createdBy,
    changeNote: null,
  };
}

/**
 * Live and draft, picked from the version list rather than trusted from a flag.
 *
 * `currentConfigurationVersionId` names the version the phone line reads, so it
 * decides which one is live. The draft is the highest-numbered version that is
 * not that one — and only when it really is numbered above it, because an
 * *older* unpublished version is history, not a pending change.
 */
function splitVersions(
  employee: api.ApiAiEmployee,
  pack: DomainPack | null,
): { live: EmployeeVersion | null; draft: EmployeeVersion | null } {
  const versions = [...employee.configurationVersions].sort(
    (a, b) => b.versionNumber - a.versionNumber,
  );

  const current = versions.find(
    (version) => version.id === employee.currentConfigurationVersionId,
  );
  const live = current ? mapVersion(current, employee, pack) : null;

  const pending = versions.find(
    (version) =>
      version.id !== current?.id &&
      version.status !== "live" &&
      (!current || version.versionNumber > current.versionNumber),
  );

  return {
    live,
    draft: pending ? mapVersion(pending, employee, pack) : null,
  };
}

function mapEmployee(
  employee: api.ApiAiEmployee,
  pack: DomainPack | null,
): AIEmployee {
  const { live, draft } = splitVersions(employee, pack);

  return {
    id: employee.id,
    workspaceId: employee.workspaceId,
    status: mapStatus(employee.status),
    liveVersion: live,
    draftVersion: draft,
    // A deployment is an employee's decision to answer a specific endpoint on
    // specific hours with a specific fallback, and nothing records one yet: the
    // voice line is configured per deployment of the *backend*, not per AI
    // employee. An invented deployment would put a phone number and a set of
    // opening hours on screen that nothing honours.
    deployments: [],
    supervisorUserIds: [],
  };
}

function packFor(industry: IndustryPackId | null): DomainPack | null {
  return industry ? getDomainPack(industry) : null;
}

export async function listRealEmployees(
  workspaceId: string,
  industry: IndustryPackId | null,
): Promise<AIEmployee[]> {
  const raw = await api.listAiEmployees(workspaceId);
  const pack = packFor(industry);
  return raw.map((employee) => mapEmployee(employee, pack));
}

export async function getRealEmployee(
  workspaceId: string,
  industry: IndustryPackId | null,
  employeeId: string,
): Promise<AIEmployee | null> {
  try {
    const raw = await api.getAiEmployee(workspaceId, employeeId);
    return mapEmployee(raw, packFor(industry));
  } catch (error) {
    if (error instanceof HttpError && (error.status === 404 || error.status === 403)) {
      return null;
    }
    throw error;
  }
}
