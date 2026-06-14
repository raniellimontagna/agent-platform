CREATE INDEX "artifacts_run_id_idx" ON "artifacts" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_run_id_kind_uq" ON "artifacts" USING btree ("run_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_active_schedule_uq" ON "runs" USING btree ("schedule_id") WHERE "runs"."status" in ('pending','planning','awaiting_approval','executing','reviewing');