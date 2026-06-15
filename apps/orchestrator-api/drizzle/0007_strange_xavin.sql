CREATE TYPE "public"."tool_risk" AS ENUM('safe', 'caution', 'dangerous');--> statement-breakpoint
CREATE TYPE "public"."tool_status" AS ENUM('active', 'deprecated');--> statement-breakpoint
CREATE TABLE "tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"version" text NOT NULL,
	"description" text,
	"risk" "tool_risk" DEFAULT 'safe' NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "tool_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tools_key_version_uq" ON "tools" USING btree ("key","version");