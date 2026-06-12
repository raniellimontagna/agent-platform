CREATE TYPE "public"."lesson_source" AS ENUM('critic', 'validation');--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo" text NOT NULL,
	"source" "lesson_source" NOT NULL,
	"category" text,
	"text" text NOT NULL,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;