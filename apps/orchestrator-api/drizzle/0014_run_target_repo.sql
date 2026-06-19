ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "target_repo" text;
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "target_repo_create" boolean DEFAULT false NOT NULL;
