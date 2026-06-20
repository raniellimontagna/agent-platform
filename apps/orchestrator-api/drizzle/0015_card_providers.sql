ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "card_provider" text NOT NULL DEFAULT 'linear';
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "card_id" text;
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "card_identifier" text;
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "card_project_id" text;

UPDATE "runs"
SET
  "card_provider" = 'linear',
  "card_id" = "linear_issue_id",
  "card_identifier" = "linear_issue_identifier"
WHERE "card_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "runs_active_card_uq"
ON "runs" ("card_provider", "card_id")
WHERE "status" in ('pending','planning','awaiting_approval','executing','reviewing')
  AND "card_id" IS NOT NULL;
