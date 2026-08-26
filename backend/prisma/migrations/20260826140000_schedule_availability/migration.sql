-- When the business is open, and how much of it can be booked at once.
--
-- The rule these three tables are built around: an unconfigured schedule is
-- not a closed business. Every workspace that exists today has no rows here,
-- and must go on booking exactly as it did — so "no rows" is read as "not
-- checked", never as "shut". That distinction lives in schedule.service.ts;
-- there is deliberately no NOT NULL default here that could smuggle in a
-- closing time nobody chose.

-- One opening period on one weekday. Two rows for the same weekday is a split
-- shift, which is why there is no is_closed flag: closed is the absence of a
-- row. Minutes from local midnight rather than database.md's opens_at/closes_at,
-- because a kitchen open until half past one closes at 1530 and no TIME column
-- holds that. location_id/department_id are omitted — neither table exists.
CREATE TABLE "business_hours" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "opens_minute" INTEGER NOT NULL,
    "closes_minute" INTEGER NOT NULL,

    CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "business_hours_workspace_id_day_of_week_idx" ON "business_hours"("workspace_id", "day_of_week");

ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A calendar date that overrides the weekly pattern. The date is text in the
-- workspace's own calendar, not a timestamp: "the 25th" is a different instant
-- in every zone, and the business means its own.
CREATE TABLE "schedule_exceptions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT true,
    "opens_minute" INTEGER,
    "closes_minute" INTEGER,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "schedule_exceptions_workspace_id_date_key" ON "schedule_exceptions"("workspace_id", "date");

ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- How bookable time is divided and how much fits in a slot. capacity_per_slot
-- is nullable on purpose: null is "nobody has told us the capacity", which the
-- employee reports as an unchecked slot rather than as a free one.
CREATE TABLE "booking_policies" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "slot_minutes" INTEGER NOT NULL DEFAULT 30,
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "capacity_per_slot" INTEGER,
    "lead_time_minutes" INTEGER NOT NULL DEFAULT 0,
    "max_advance_days" INTEGER NOT NULL DEFAULT 180,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_policies_workspace_id_key" ON "booking_policies"("workspace_id");

ALTER TABLE "booking_policies" ADD CONSTRAINT "booking_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bookings are counted per slot on every availability check and every write,
-- always for one workspace over a narrow time window.
CREATE INDEX "records_workspace_id_type_id_scheduled_at_idx" ON "records"("workspace_id", "type_id", "scheduled_at");
