import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as scheduleService from "./schedule.service.js";
import { requireWorkspaceCapability, requireWorkspaceMember } from "@/lib/workspace-access.js";
import { ApiError } from "@/lib/errors/api-error.js";

const workspaceIdParamsSchema = z.object({ workspaceId: z.string().min(1) });

/**
 * Minutes from local midnight. Up to 1440 for a closing time, and past it for
 * a period that runs into the small hours — a kitchen open until half one
 * closes at 1530, which is a real Saturday and not a typo.
 */
const minuteSchema = z.number().int().min(0).max(2879);

const periodSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    opensMinute: minuteSchema,
    closesMinute: minuteSchema,
  })
  .refine((p) => p.closesMinute > p.opensMinute, {
    message: "A period must close after it opens.",
  });

const exceptionSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
    closed: z.boolean(),
    opensMinute: minuteSchema.nullable().optional(),
    closesMinute: minuteSchema.nullable().optional(),
    reason: z.string().trim().max(120).nullable().optional(),
  })
  .refine(
    (e) => e.closed || e.opensMinute == null || e.closesMinute == null || e.closesMinute > e.opensMinute,
    { message: "A day that is open must close after it opens." },
  );

const policySchema = z.object({
  slotMinutes: z.number().int().min(5).max(240).optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  /**
   * Null is "not configured", and the tool layer reports that as an unchecked
   * slot rather than a free one. Zero is refused rather than treated as null:
   * a capacity of nothing would make every time unbookable, and a business
   * that typed it meant something else.
   */
  capacityPerSlot: z.number().int().min(1).max(10_000).nullable().optional(),
  leadTimeMinutes: z.number().int().min(0).max(60 * 24 * 30).optional(),
  maxAdvanceDays: z.number().int().min(1).max(730).optional(),
});

const scheduleBodySchema = z.object({
  periods: z.array(periodSchema).max(50).optional(),
  exceptions: z.array(exceptionSchema).max(200).optional(),
  policy: policySchema.optional(),
});

export function registerScheduleRoutes(app: FastifyInstance): void {
  // GET /workspaces/:workspaceId/schedule
  //
  // Membership is the right gate for reading. Everyone who works here needs to
  // know when the business is open — an Operator looking at why a caller was
  // turned away at six should not need a governance role to see closing time.
  app.get(
    "/workspaces/:workspaceId/schedule",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
      await requireWorkspaceMember(request.userId!, workspaceId);

      const schedule = await scheduleService.getSchedule(workspaceId);
      if (!schedule) throw new ApiError("RESOURCE_NOT_FOUND", "Workspace not found.");

      reply.send({
        data: {
          ...schedule,
          // Stated rather than inferred from an empty array, because the two
          // readings differ in the only way that matters: no hours means the
          // employee books anything, not that the business is shut.
          hoursConfigured: scheduleService.hasOpeningHours(schedule),
          capacityConfigured: scheduleService.hasCapacity(schedule),
        },
      });
    },
  );

  // PUT /workspaces/:workspaceId/schedule
  //
  // Gated on `channel.manage`, the permission behind the surface that owns
  // operating hours. Takes effect on the next call — there is no draft, which
  // is worth saying on screen before anyone presses save, because a caller is
  // potentially mid-dial while it is being edited.
  app.put(
    "/workspaces/:workspaceId/schedule",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
      const body = scheduleBodySchema.parse(request.body);
      await requireWorkspaceCapability(request.userId!, workspaceId, "channel.manage");

      // A booking longer than the grain it is offered on double-books by
      // construction: 60-minute appointments offered every 30 minutes means
      // every slot overlaps its neighbour, and capacity stops meaning what
      // the business thinks it means. Refused with the reason rather than
      // stored and quietly mis-counted.
      const merged = { ...scheduleService.DEFAULT_POLICY, ...(body.policy ?? {}) };
      if (body.policy && merged.durationMinutes > merged.slotMinutes && merged.capacityPerSlot != null) {
        throw new ApiError(
          "VALIDATION_ERROR",
          `A ${merged.durationMinutes}-minute booking cannot be offered every ${merged.slotMinutes} minutes ` +
            `with a capacity limit — every slot would overlap the next. Match the slot length to the ` +
            `booking length, or leave capacity unset.`,
        );
      }

      const schedule = await scheduleService.setSchedule(workspaceId, {
        ...body,
        actorUserId: request.userId!,
      });
      if (!schedule) throw new ApiError("RESOURCE_NOT_FOUND", "Workspace not found.");

      reply.send({
        data: {
          ...schedule,
          hoursConfigured: scheduleService.hasOpeningHours(schedule),
          capacityConfigured: scheduleService.hasCapacity(schedule),
        },
      });
    },
  );
}
