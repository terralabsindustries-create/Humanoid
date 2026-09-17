-- Aligns the column with database.md § business_hours, which names it
-- `day_of_week`. The three deliberate divergences from that spec stay, and are
-- documented on the model: minutes rather than opens_at/closes_at (a kitchen
-- open until half past one closes at 1530, which no TIME column holds), no
-- is_closed flag (closed is the absence of a row, which is also what lets two
-- rows on one weekday mean a split shift), and no location_id/department_id
-- (neither table exists in this schema).
--
-- Its own migration rather than an edit to the one that created the table:
-- that migration had already been applied, and editing an applied migration
-- leaves every database that ran it disagreeing with the schema.
ALTER TABLE "business_hours" RENAME COLUMN "weekday" TO "day_of_week";
ALTER INDEX "business_hours_workspace_id_weekday_idx" RENAME TO "business_hours_workspace_id_day_of_week_idx";
