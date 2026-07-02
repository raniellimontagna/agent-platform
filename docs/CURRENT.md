# Current State

**Last reviewed:** 2026-07-02

`agent-platform` is a self-hosted agent delivery platform. Plane cards in
workspace `attodev`, project `Agent Platform` (`AGP`), are the current
operational intake surface. Linear remains legacy/migration-only compatibility
and migration history; it is not an active provider path for new work.

## Canonical Flow

```text
Plane card + ai-ready
  -> /webhooks/plane validates HMAC and label transition
  -> createRun persists Plane card identity
  -> BullMQ agent-runs plan job
  -> planner role comments the plan
  -> approved label resumes the run when approval is required
  -> orchestrator worker dispatches worker-code /jobs
  -> worker-code runJob validates, self-corrects, commits, and reports back
  -> critic/recode loop
  -> GitHub PR / optional auto-merge
  -> final Plane comment and status report
```

Evidence anchors:

| Stage | Owner | Focused local evidence |
|-------|-------|------------------------|
| Plane intake and approval/resume | `apps/orchestrator-api/src/routes/webhooks.ts` | `apps/orchestrator-api/src/routes/webhooks.test.ts` |
| Run identity and card persistence | `apps/orchestrator-api/src/runs.ts` | `apps/orchestrator-api/src/runs.test.ts` |
| BullMQ job shape and priority | `apps/orchestrator-api/src/queue.ts` | `apps/orchestrator-api/src/queue.test.ts` |
| Orchestrator worker and continuation dispatch | `apps/orchestrator-api/src/worker.ts` | `apps/orchestrator-api/src/worker.test.ts` |
| Worker HTTP API route | `apps/worker-code/src/routes/jobs.ts` | Static docs anchor; runner behavior is covered by `apps/worker-code/src/executor/runJob.test.ts`. |
| Worker runner, validation, and callback | `apps/worker-code/src/executor/runJob.ts` | `apps/worker-code/src/executor/runJob.test.ts` |
| Final provider report | `packages/graph/src/nodes/report.ts` | `packages/graph/src/nodes/report.test.ts` |
| GitHub merge/auto-merge decision | `packages/graph/src/nodes/merging.ts` | `packages/graph/src/nodes/merging.test.ts` |

## Runtime Ownership

| Boundary | Owner Files | Notes |
|----------|-------------|-------|
| Card providers | `packages/cards`, `packages/plane`, `packages/linear`, `apps/orchestrator-api/src/cards.ts` | Plane is the only active provider for new work; Linear is legacy/migration-only compatibility. |
| Webhook intake | `apps/orchestrator-api/src/routes/webhooks.ts` | `/webhooks/plane` is active. `/webhooks/linear` is compatibility-only and disabled unless explicit legacy config is present. |
| Run persistence | `apps/orchestrator-api/src/runs.ts`, `apps/orchestrator-api/src/db/schema.ts` | Generic `card_*` fields are authoritative and default to Plane; `linear_issue_*` columns remain for old rows until production audit and destructive confirmation. |
| Agent queue | `apps/orchestrator-api/src/queue.ts`, `apps/orchestrator-api/src/worker.ts` | BullMQ `agent-runs` owns `plan` and `resume` jobs, including approval resume priority and research-to-landing continuation enqueueing. |
| Agent graph | `packages/graph`, `apps/orchestrator-api/src/agent.ts` | `software-delivery-pipeline` names roles; `coder-agent` remains compatibility key. |
| Worker execution | `apps/worker-code/src/routes/jobs.ts`, `apps/worker-code/src/executor/runJob.ts` and helpers | `/jobs` and `/jobs/sync` receive orchestrator dispatch; runner owns codegen, research, validation, self-correction, commit, and report callback. |
| Eval harness | `apps/worker-code/src/eval/*` | `pnpm verify` includes eval and regression eval. |
| Operator UI | `apps/orchestrator-api/src/routes/admin.ts`, `missionTimeline.ts` | Mission Control is read-only for E2E inspection. |

## Current Verification Gate

Use the project-standard command:

```bash
rtk corepack pnpm verify
```

This runs lint, build, tests, worker eval, and eval regression.

## Provider Cutover Status

- New run/card identity defaults to Plane.
- `CARD_EXTRA_PROVIDERS` should stay empty in normal operation.
- `LINEAR_API_KEY`, `LINEAR_WEBHOOK_SECRET`, and `/webhooks/linear` are retained
  only for migration, old-row compatibility, or an explicit rollback window.
- `plane:migrate-linear` remains the supported migration seam for Linear-origin
  provenance.
- Do not drop or rename `linear_issue_id` or `linear_issue_identifier` until a
  read-only production row audit is recorded and a separate destructive cleanup
  confirmation exists.

## Active Runbooks

- [webhook-tailscale](runbooks/webhook-tailscale.md) — expose and test Plane
  webhook paths.
- [mission-control](runbooks/mission-control.md) — inspect E2E scenario state.
- [research-to-landing-workflow](runbooks/research-to-landing-workflow.md) —
  run the composed research-to-landing flow.
- [eval-harness](runbooks/eval-harness.md) — deterministic worker evals.
- [agent-skills](runbooks/agent-skills.md) — local agent skill registry.
- [secrets](runbooks/secrets.md) — env/secrets inventory.
- [proxmox-estado-atual](runbooks/proxmox-estado-atual.md) — live infra state.

## Current Cleanup Direction

The cleanup milestone under `.planning/` is authoritative for the current
refactor effort:

- Phase 1: inventory and risk matrix.
- Phase 2: living docs vs historical archive.
- Phase 3: Plane-only provider cutover, if migration gates pass.
- Phase 4: flow and naming normalization.
- Phase 5: orchestrator hub refactor.
- Phase 6: worker/eval hub refactor.
- Phase 7: final verification and governance closeout.
