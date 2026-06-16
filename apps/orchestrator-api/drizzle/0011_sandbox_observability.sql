ALTER TABLE "runs" ADD COLUMN "sandbox_backend" text;
ALTER TABLE "runs" ADD COLUMN "sandbox_image" text;
ALTER TABLE "runs" ADD COLUMN "sandbox_network" text;
ALTER TABLE "runs" ADD COLUMN "sandbox_command_count" integer;
ALTER TABLE "runs" ADD COLUMN "sandbox_total_duration_ms" integer;
ALTER TABLE "runs" ADD COLUMN "sandbox_max_command_duration_ms" integer;
ALTER TABLE "runs" ADD COLUMN "sandbox_failed_command" text;
