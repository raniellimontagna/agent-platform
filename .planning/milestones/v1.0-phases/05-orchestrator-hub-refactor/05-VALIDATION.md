---
phase: 05
slug: orchestrator-hub-refactor
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-02
---

# Phase 05 - Validation Strategy

Per-phase validation contract for the Orchestrator Hub Refactor. The goal is to
sample each risky extraction before behavior moves, keep feedback local to the
changed seam, and close the phase with the full repository verification gate.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^3.2.0` |
| **Config file** | `vitest.config.ts` |
| **Shared helper quick command** | `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/routeAuth.test.ts apps/orchestrator-api/src/routes/rendering.test.ts apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/routes/registry.test.ts apps/orchestrator-api/src/routes/agents.test.ts apps/orchestrator-api/src/routes/schedules.test.ts apps/orchestrator-api/src/routes/tools.test.ts` |
| **Webhook seam quick command** | `rtk corepack pnpm vitest run apps/orchestrator-api/src/webhookSignature.test.ts apps/orchestrator-api/src/planeWebhook.test.ts apps/orchestrator-api/src/webhookRunActions.test.ts apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/cardWebhook.test.ts apps/orchestrator-api/src/runs.test.ts apps/orchestrator-api/src/queue.test.ts` |
| **Mission Control quick command** | `rtk corepack pnpm vitest run apps/orchestrator-api/src/missionControlData.test.ts apps/orchestrator-api/src/missionControlRender.test.ts apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/missionScenarios.test.ts apps/orchestrator-api/src/missionTimeline.test.ts apps/orchestrator-api/src/artifacts.test.ts apps/orchestrator-api/src/routes/artifacts.test.ts` |
| **Typecheck command** | `rtk corepack pnpm --filter @agent-platform/orchestrator-api typecheck` |
| **Full suite command** | `rtk corepack pnpm verify` |

---

## Requirement Evidence Map

| Requirement | Goal Truth | Primary Evidence | Static Evidence |
|-------------|------------|------------------|-----------------|
| REF-01 | Shared route auth/render helpers replace duplicated `requireAuth`, `escapeHtml`, `formatDate`, and similar local copies where appropriate. | `routeAuth.test.ts`, `rendering.test.ts`, and route characterization tests for admin, registry, agents, schedules, and tools. | `routes/admin.ts`, `routes/registry.ts`, `routes/agents.ts`, `routes/schedules.ts`, and `routes/tools.ts` import shared helpers and no package files are changed. |
| REF-02 | Webhook handling is split into provider-neutral intake and Plane-specific parsing/transition logic. | `webhookSignature.test.ts`, `planeWebhook.test.ts`, `webhookRunActions.test.ts`, `routes/webhooks.test.ts`, `cardWebhook.test.ts`, `runs.test.ts`, and `queue.test.ts`. | `/webhooks/plane` remains active, `/webhooks/linear` remains legacy compatibility, and route JSON shapes/queue payloads stay stable. |
| VER-01 | Characterization tests protect behavior before each risky refactor. | New seam tests are written before production movement and route tests continue to pass after movement. | Each plan summary records RED or fail-first evidence before GREEN implementation for risky extractions. |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 05-01 | 1 | REF-01, VER-01 | T-05-01-01 | Shared bearer auth preserves exact `RUNNER_AUTH_TOKEN` comparison and 401 JSON for protected routes. | unit + route | `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/routeAuth.test.ts apps/orchestrator-api/src/routes/agents.test.ts apps/orchestrator-api/src/routes/schedules.test.ts apps/orchestrator-api/src/routes/tools.test.ts` | W0 creates `routeAuth.test.ts` | pending |
| 05-01-02 | 05-01 | 1 | REF-01, VER-01 | T-05-01-02 | Shared escaping/date helpers do not sanitize less than current route-local helpers. | unit + route | `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/rendering.test.ts apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/routes/registry.test.ts` | W0 creates `rendering.test.ts` | pending |
| 05-02-01 | 05-02 | 2 | REF-02, VER-01 | T-05-02-01 | HMAC validation and Plane payload parsing preserve signature, event, card, label, removal, and identifier behavior. | unit + route | `rtk corepack pnpm vitest run apps/orchestrator-api/src/webhookSignature.test.ts apps/orchestrator-api/src/planeWebhook.test.ts apps/orchestrator-api/src/routes/webhooks.test.ts` | W0 creates signature/parser tests | pending |
| 05-02-02 | 05-02 | 2 | REF-02, VER-01 | T-05-02-02 | Plane run transitions preserve duplicate, pause, cost, unique-violation, approval, cancel, queue payload, and priority behavior. | unit + route | `rtk corepack pnpm vitest run apps/orchestrator-api/src/webhookRunActions.test.ts apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/cardWebhook.test.ts apps/orchestrator-api/src/runs.test.ts apps/orchestrator-api/src/queue.test.ts` | W0 creates action tests | pending |
| 05-03-01 | 05-03 | 3 | REF-01, VER-01 | T-05-03-01 | Mission Control data assembly preserves JSON shape, safe limit bounds, source-run grouping, artifact/approval aggregation, and 404 behavior. | unit + route | `rtk corepack pnpm vitest run apps/orchestrator-api/src/missionControlData.test.ts apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/missionScenarios.test.ts apps/orchestrator-api/src/missionTimeline.test.ts apps/orchestrator-api/src/artifacts.test.ts` | W0 creates data tests | pending |
| 05-03-02 | 05-03 | 3 | REF-01, VER-01 | T-05-03-02 | Mission Control render extraction preserves escaped HTML, read-only copy, route content type, and no operator controls. | unit + route + full | `rtk corepack pnpm vitest run apps/orchestrator-api/src/missionControlRender.test.ts apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/routes/artifacts.test.ts && rtk corepack pnpm --filter @agent-platform/orchestrator-api typecheck && rtk corepack pnpm verify` | W0 creates render tests | pending |

---

## Wave 0 Requirements

- [ ] `apps/orchestrator-api/src/routes/routeAuth.test.ts` covers exact bearer comparison, missing/wrong token 401 JSON, and successful middleware continuation.
- [ ] `apps/orchestrator-api/src/routes/rendering.test.ts` covers `escapeHtml`, `formatDate`, and `humanizeStatus` behavior before admin/registry imports move.
- [ ] `apps/orchestrator-api/src/webhookSignature.test.ts` covers missing/wrong signatures, timing-safe length mismatch, Plane no-secret development acceptance, and production rejection.
- [ ] `apps/orchestrator-api/src/planeWebhook.test.ts` covers `work_item` and `issue` events, `updated_from` and `updatedFrom`, label name/id extraction, removal actions, and card identifier fallback.
- [ ] `apps/orchestrator-api/src/webhookRunActions.test.ts` covers ai-ready enqueue skips, approval-with-no-run skip, resume priority, removal cancellation, and plan queue payloads.
- [ ] `apps/orchestrator-api/src/missionControlData.test.ts` covers summary/detail data assembly boundaries before moving logic from `routes/admin.ts`.
- [ ] `apps/orchestrator-api/src/missionControlRender.test.ts` covers malicious values, read-only Mission Control copy, artifact links, PR URLs, and empty states before moving renderers.

---

## Sampling Rate

- **After every fail-first test task:** Run only the new focused test file and confirm it fails for the intended missing export or moved seam.
- **After every implementation task:** Run the seam quick command plus `rtk corepack pnpm --filter @agent-platform/orchestrator-api typecheck`.
- **After Wave 1:** Run the shared helper quick command and verify package files are unchanged.
- **After Wave 2:** Run the webhook quick command for 05-02.
- **After Wave 3:** Run the Mission Control quick command and then `rtk corepack pnpm verify` in Plan 05-03 so the final proof covers 05-01, 05-02, and 05-03.
- **Max focused feedback latency:** Keep each seam quick command under 2 minutes where possible.

---

## Manual-Only Verifications

All Phase 5 behaviors have automated local verification. Live Plane, Tailscale,
provider dashboards, database schema changes, deployment configuration, and
worker/eval internals are out of scope for this phase and must not be changed by
these plans.

---

## Dirty Worktree Handling

Executors must preserve and ignore unrelated untracked `.planning/PROJECT.md`,
`.planning/config.json`, `.planning/phases/01-bootstrap-and-architectural-inventory/`,
`.planning/phases/02-living-documentation-and-historical-archive/`,
`.planning/research/`, and `docs/superpowers/README.md`. Do not revert,
delete, format, or add those paths while executing Phase 5 plans.

---

## Validation Sign-Off

- [ ] `05-01-PLAN.md` validates with plan frontmatter and plan-structure checks.
- [ ] `05-02-PLAN.md` validates with plan frontmatter and plan-structure checks.
- [ ] `05-03-PLAN.md` validates with plan frontmatter and plan-structure checks.
- [ ] `05-VALIDATION.md` exists and maps REF-01, REF-02, and VER-01 to automated evidence.
- [ ] Each risky extraction records fail-first characterization evidence before implementation.
- [ ] No package installs or dependency upgrades occur; package files stay unchanged.
- [ ] `rtk corepack pnpm verify` passes at Phase 5 closeout.

**Approval:** pending
