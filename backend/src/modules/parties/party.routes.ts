import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as partyService from "./party.service.js";
import { requireWorkspaceMember } from "@/lib/workspace-access.js";
import { recordAudit } from "@/lib/audit.js";
import { ApiError } from "@/lib/errors/api-error.js";

const workspaceIdParamsSchema = z.object({ workspaceId: z.string().min(1) });
const partyParamsSchema = z.object({
  workspaceId: z.string().min(1),
  partyId: z.string().min(1),
});

const listQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  // Query strings have no booleans; the frontend sends the flag or omits it.
  unconfirmedOnly: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

/**
 * A fact is addressed by its label, and the label travels in the body rather
 * than the path. Labels are human sentences — they carry spaces, and one day
 * a slash — and a path segment is the wrong container for a value like that;
 * percent-encoding it works until a proxy normalises the request and quietly
 * splits the label in two.
 */
const confirmBodySchema = z.object({ label: z.string().trim().min(1).max(120) });
const correctBodySchema = confirmBodySchema.extend({
  value: z.string().trim().min(1).max(500),
});

type ServiceParty = NonNullable<Awaited<ReturnType<typeof partyService.getParty>>>;

function serialiseParty(party: ServiceParty) {
  return {
    id: party.id,
    displayName: party.displayName,
    phone: party.primaryPhone,
    email: party.primaryEmail,
    preferredLanguage: party.preferredLanguage,
    status: party.status,
    facts: party.facts.map((fact) => ({
      label: fact.label,
      value: fact.value,
      source: fact.source,
      updatedAt: fact.updatedAt.toISOString(),
    })),
    createdAt: party.createdAt.toISOString(),
    lastContactAt: party.lastContactAt?.toISOString() ?? null,
  };
}

export function registerPartyRoutes(app: FastifyInstance): void {
  // GET /workspaces/:workspaceId/parties — everyone the AI employee has spoken to
  app.get(
    "/workspaces/:workspaceId/parties",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
      const query = listQuerySchema.parse(request.query);
      await requireWorkspaceMember(request.userId!, workspaceId);

      const parties = await partyService.listParties(workspaceId, {
        search: query.search,
        unconfirmedOnly: query.unconfirmedOnly === "true",
        limit: query.limit,
      });

      reply.send({ data: parties.map(serialiseParty) });
    },
  );

  // GET /workspaces/:workspaceId/parties/:partyId
  app.get(
    "/workspaces/:workspaceId/parties/:partyId",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId, partyId } = partyParamsSchema.parse(request.params);
      await requireWorkspaceMember(request.userId!, workspaceId);

      const party = await partyService.getParty(workspaceId, partyId);
      if (!party) throw new ApiError("RESOURCE_NOT_FOUND", "Record not found");

      reply.send({ data: serialiseParty(party) });
    },
  );

  // POST /workspaces/:workspaceId/parties/:partyId/facts/confirm — "we checked, it's right"
  app.post(
    "/workspaces/:workspaceId/parties/:partyId/facts/confirm",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId, partyId } = partyParamsSchema.parse(request.params);
      const { label } = confirmBodySchema.parse(request.body);
      await requireWorkspaceMember(request.userId!, workspaceId);

      const party = await settle(request.userId!, { workspaceId, partyId, label });
      reply.send({ data: serialiseParty(party) });
    },
  );

  // PATCH /workspaces/:workspaceId/parties/:partyId/facts — "we checked, here's the right value"
  app.patch(
    "/workspaces/:workspaceId/parties/:partyId/facts",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId, partyId } = partyParamsSchema.parse(request.params);
      const { label, value } = correctBodySchema.parse(request.body);
      await requireWorkspaceMember(request.userId!, workspaceId);

      const party = await settle(request.userId!, { workspaceId, partyId, label, value });
      reply.send({ data: serialiseParty(party) });
    },
  );
}

/**
 * Both writes are the same operation with and without a new value, and both
 * are audited: a person vouching for what the AI heard is exactly the kind of
 * decision `audit_events` exists to hold.
 *
 * The fact's *value* is deliberately not in the audit metadata. The label
 * says which claim was settled, which is what an auditor needs; copying a
 * caller's date of birth into an append-only log that outlives every
 * retention policy is how protected data ends up somewhere nobody remembers
 * to delete it.
 */
async function settle(
  userId: string,
  input: { workspaceId: string; partyId: string; label: string; value?: string },
): Promise<ServiceParty> {
  const party = await partyService.settleFact({ ...input, userId });
  if (!party) throw new ApiError("RESOURCE_NOT_FOUND", "Record not found");

  await recordAudit({
    workspaceId: input.workspaceId,
    actorType: "user",
    actorId: userId,
    action: input.value === undefined ? "party.fact.confirmed" : "party.fact.corrected",
    resourceType: "party",
    resourceId: input.partyId,
    metadata: { label: input.label },
  });

  return party;
}
