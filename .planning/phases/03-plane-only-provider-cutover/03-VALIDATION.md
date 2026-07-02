---
phase: 03
slug: plane-only-provider-cutover
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-02
---

# Phase 03 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.6 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `rtk corepack pnpm test -- apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/runs.test.ts apps/orchestrator-api/src/cards.test.ts apps/orchestrator-api/src/env.test.ts` |
| **Full suite command** | `rtk corepack pnpm verify` |
| **Estimated runtime** | Quick seam tests under 2 minutes; full verify depends on eval runtime. |

---

## Sampling Rate

- **After every task commit:** Run the focused Vitest command for the touched seam.
- **After every plan wave:** Run `rtk corepack pnpm test` plus a grep/static check for removed active Linear defaults.
- **Before phase verification:** Run `rtk corepack pnpm verify`.
- **Max feedback latency:** Keep focused checks under 2 minutes where possible.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 03-01 | 1 | PLN-02, PLN-03 | T-03-provider-confusion | Plane-only runtime defaults do not silently enable Linear. | unit | `rtk corepack pnpm test -- apps/orchestrator-api/src/cards.test.ts apps/orchestrator-api/src/env.test.ts apps/orchestrator-api/src/queue.test.ts` | yes / created by plan | pending |
| 03-01-02 | 03-01 | 1 | PLN-03 | T-03-spoofed-webhook | Plane webhook intake, approval, report, auto-merge, scheduler, and card-run history are characterized before cutover. | route/unit | `rtk corepack pnpm test -- apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/scheduleWorker.test.ts apps/orchestrator-api/src/routes/admin.test.ts packages/graph/src/nodes/report.test.ts packages/graph/src/nodes/merging.test.ts packages/graph/src/nodes/autoMerge.test.ts` | yes / created by plan | pending |
| 03-01-03 | 03-01 | 1 | PLN-04 | T-03-legacy-data-loss | Legacy rows and migration provenance remain readable before runtime changes. | unit | `rtk corepack pnpm test -- apps/orchestrator-api/src/runs.test.ts apps/orchestrator-api/src/planeMigration.test.ts packages/plane/src/index.test.ts` | yes | pending |
| 03-02-01 | 03-02 | 2 | PLN-01, PLN-02, PLN-03 | T-03-provider-confusion | Provider registry, env validation, and graph enablement default to Plane and keep Linear explicit-only. | unit + static | `rtk corepack pnpm test -- apps/orchestrator-api/src/cards.test.ts apps/orchestrator-api/src/env.test.ts apps/orchestrator-api/src/agent.test.ts` | yes | pending |
| 03-03-01 | 03-03 | 3 | PLN-02, PLN-03, PLN-04 | T-03-provider-confusion | Queue/worker reject unresolved ambiguity while old BullMQ jobs resolve through persisted run data when available. | unit + operator checkpoint | `rtk corepack pnpm test -- apps/orchestrator-api/src/queue.test.ts apps/orchestrator-api/src/worker.test.ts` | yes / created by plan | pending |
| 03-03-02 | 03-03 | 3 | PLN-03 | T-03-provider-confusion | Scheduler-created cards use Plane scheduled labels and no Linear scheduled-label fallback. | unit | `rtk corepack pnpm test -- apps/orchestrator-api/src/scheduleWorker.test.ts` | yes / created by plan | pending |
| 03-04-01 | 03-04 | 4 | PLN-01, PLN-02, PLN-03 | T-03-legacy-route-active | Legacy webhook is disabled by default, Plane webhook remains active, env examples are Plane-only. | route unit + static + operator checkpoint | `rtk corepack pnpm test -- apps/orchestrator-api/src/routes/webhooks.test.ts` | yes | pending |
| 03-05-01 | 03-05 | 5 | PLN-04 | T-03-legacy-data-loss | New generic run defaults are Plane, legacy columns remain readable, and migration is non-destructive. | unit + static | `rtk corepack pnpm test -- apps/orchestrator-api/src/runs.test.ts` | yes | pending |
| 03-05-02 | 03-05 | 5 | PLN-01, PLN-02, PLN-04 | T-03-dashboard-drift | Dashboards and docs prefer generic card identifiers with legacy fallback notes. | static | `rtk grep "linear_issue_identifier AS issue" infra/compose/observability/provisioning/dashboards docs README.md` | yes | pending |
| 03-05-03 | 03-05 | 5 | PLN-03, PLN-04 | T-03-provider-confusion | Final phase gate passes full verify and eval regression. | full suite + eval | `rtk corepack pnpm verify` and `rtk corepack pnpm eval:regression` | yes | pending |

*Status values: pending, green, red, flaky.*

---

## Wave 0 Requirements

- [ ] `apps/orchestrator-api/src/queue.test.ts` - Plan 03-01 creates characterization coverage; Plan 03-03 adds target persisted-run compatibility and ambiguity rejection.
- [ ] `apps/orchestrator-api/src/worker.test.ts` - Plan 03-03 creates or updates worker-provider tests for resume/report/research-to-landing provider resolution.
- [ ] `apps/orchestrator-api/src/scheduleWorker.test.ts` - Plan 03-01 creates characterization coverage; Plan 03-03 adds target Plane scheduled-label behavior.
- [ ] Move `CARD_EXTRA_PROVIDERS=linear` out of global `vitest.setup.ts` and into explicit legacy/migration tests in Plan 03-01.
- [ ] Update `apps/orchestrator-api/src/cards.test.ts` for Plane-only runtime registry and explicit legacy provider behavior in Plans 03-01 and 03-02.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Deployed env no longer enables Linear by default | PLN-02 | Local repo cannot inspect deployed secrets safely. | Confirm production/staging does not set `CARD_EXTRA_PROVIDERS=linear` unless legacy compatibility is intentionally enabled. |
| Linear webhook exposure removed from external provider UI/Tailscale if route is disabled | PLN-02, PLN-03 | Requires access to Plane/Linear/Tailscale deployment state. | Check Tailscale Funnel and provider webhook settings before deleting or disabling external Linear webhook exposure. |
| Production row/queue compatibility | PLN-04 | Local workspace cannot inspect production database or Redis queue. | Count rows/jobs with legacy-only `linear_issue_*` or missing `card_*` data before destructive DB or queue fallback changes. |

---

## Validation Sign-Off

- [ ] All tasks have automated verify commands or Wave 0 dependencies.
- [ ] Sampling continuity: no three consecutive tasks without automated verification.
- [ ] Wave 0 covers missing test files.
- [ ] No watch-mode flags.
- [ ] Focused feedback latency under 2 minutes where possible.
- [ ] `nyquist_compliant: true` set in frontmatter after Wave 0 is implemented and commands pass.

**Approval:** pending
