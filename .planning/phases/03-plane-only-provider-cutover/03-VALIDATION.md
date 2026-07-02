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
| 03-01-01 | 03-01 | 1 | PLN-02, PLN-03 | T-03-provider-confusion | Plane-only runtime defaults do not silently enable Linear. | unit | `rtk corepack pnpm test -- apps/orchestrator-api/src/cards.test.ts apps/orchestrator-api/src/env.test.ts` | yes | pending |
| 03-01-02 | 03-01 | 1 | PLN-02 | T-03-provider-confusion | Queue/worker reject ambiguous provider state or resolve from persisted generic card fields. | unit | `rtk corepack pnpm test -- apps/orchestrator-api/src/queue.test.ts apps/orchestrator-api/src/worker.test.ts` | Wave 0 gap | pending |
| 03-01-03 | 03-01 | 1 | PLN-03 | T-03-spoofed-webhook | Plane webhook intake and approval remain signed and provider-specific. | route unit | `rtk corepack pnpm test -- apps/orchestrator-api/src/routes/webhooks.test.ts` | yes | pending |
| 03-01-04 | 03-01 | 1 | PLN-03 | T-03-provider-confusion | Scheduler-created cards use Plane labels and no Linear scheduled-label fallback. | unit | `rtk corepack pnpm test -- apps/orchestrator-api/src/scheduleWorker.test.ts` | Wave 0 gap | pending |
| 03-02-01 | 03-02 | 2 | PLN-02, PLN-03 | T-03-legacy-route-active | Active runtime wiring and docs describe Linear only as legacy/migration-only. | static + unit | `rtk grep "CARD_EXTRA_PROVIDERS=linear\\|linear_issue_identifier AS issue" vitest.setup.ts apps infra docs` | yes | pending |
| 03-03-01 | 03-03 | 2 | PLN-04 | T-03-legacy-data-loss | Legacy Linear-origin rows remain readable and migration provenance is preserved. | unit | `rtk corepack pnpm test -- apps/orchestrator-api/src/runs.test.ts apps/orchestrator-api/src/planeMigration.test.ts packages/plane/src/index.test.ts` | yes | pending |
| 03-03-02 | 03-03 | 2 | PLN-01, PLN-04 | T-03-dashboard-drift | Dashboards and docs prefer generic card identifiers with legacy fallback notes. | static | `rtk grep "linear_issue_identifier AS issue" infra/compose/observability/provisioning/dashboards docs README.md` | yes | pending |

*Status values: pending, green, red, flaky.*

---

## Wave 0 Requirements

- [ ] `apps/orchestrator-api/src/queue.test.ts` - characterize missing-provider behavior and removal of silent Linear defaults.
- [ ] `apps/orchestrator-api/src/scheduleWorker.test.ts` - characterize scheduler-created Plane card labels and removal of Linear scheduled-label fallback.
- [ ] Move `CARD_EXTRA_PROVIDERS=linear` out of global `vitest.setup.ts` and into explicit legacy/migration tests.
- [ ] Update `apps/orchestrator-api/src/cards.test.ts` for Plane-only runtime registry and explicit legacy provider behavior.
- [ ] Add or update worker-provider tests for resume/report/research-to-landing provider resolution.

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
