CREATE TYPE "public"."approval_reason" AS ENUM('plan', 'migration', 'auth_security', 'infra', 'deploy', 'critical_deps', 'cost_limit', 'file_deletion');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('pending', 'planning', 'awaiting_approval', 'executing', 'reviewing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."step_type" AS ENUM('plan', 'approval', 'branch', 'code', 'test', 'review', 'pr', 'comment');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"reason" "approval_reason" NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"summary" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text
);
--> statement-breakpoint
CREATE TABLE "run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"type" "step_type" NOT NULL,
	"status" "step_status" DEFAULT 'pending' NOT NULL,
	"model" text,
	"cost_usd" numeric(10, 4),
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"linear_issue_id" text NOT NULL,
	"linear_issue_identifier" text NOT NULL,
	"title" text NOT NULL,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"branch" text,
	"pr_url" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;