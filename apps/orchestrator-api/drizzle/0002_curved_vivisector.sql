ALTER TABLE "runs" ADD COLUMN "tests_passed" boolean;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "verdict" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "fix_attempts" integer;