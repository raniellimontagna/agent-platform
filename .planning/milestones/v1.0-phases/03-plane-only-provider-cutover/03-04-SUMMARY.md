---
phase: 03-plane-only-provider-cutover
plan: "04"
subsystem: api
tags: [plane, linear-compatibility, webhooks, env, tailscale, live-checkpoint]

requires:
  - phase: 03-plane-only-provider-cutover
    provides: Async runtime Plane-only cutover and BullMQ checkpoint from 03-03
provides:
  - Legacy Linear webhook route gated behind explicit compatibility config
  - Plane-only env examples
  - Deployed env and webhook exposure cut over to Plane-only active intake
affects: [03-05, provider-cutover, webhook-runtime, deployment]

tech-stack:
  added: []
  patterns:
    - Legacy route support remains in code but requires explicit compatibility config
    - Env examples document Linear as migration/legacy-only, not active default
    - Live deployment checkpoints record external provider and Funnel state

key-files:
  created:
    - .planning/phases/03-plane-only-provider-cutover/03-04-SUMMARY.md
  modified:
    - apps/orchestrator-api/src/routes/webhooks.ts
    - apps/orchestrator-api/src/routes/webhooks.test.ts
    - apps/orchestrator-api/.env.example
    - infra/compose/orchestrator/.env.example
    - .planning/phases/03-plane-only-provider-cutover/03-04-CHECKPOINT.md

key-decisions:
  - "The deployed orchestrator no longer enables CARD_EXTRA_PROVIDERS=linear."
  - "Tailscale Funnel exposes only /webhooks/plane for public provider intake."
  - "The existing Linear webhook registration was disabled rather than deleted for reversibility."

requirements-completed: [PLN-01, PLN-02, PLN-03]

coverage:
  - id: D1
    description: Legacy Linear webhook route is disabled by default and only available with explicit compatibility config
    requirement: PLN-02
    verification:
      - kind: unit
        ref: "rtk corepack pnpm test -- apps/orchestrator-api/src/routes/webhooks.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: Env examples no longer enable Linear by default
    requirement: PLN-01
    verification:
      - kind: static
        ref: "grep fallback for absence of CARD_EXTRA_PROVIDERS=linear in env examples"
        status: pass
    human_judgment: false
  - id: D3
    description: Deployed env and webhook exposure do not leave Linear active
    requirement: PLN-02
    verification:
      - kind: live
        ref: "LXC 201: CARD_EXTRA_PROVIDERS empty, Funnel exposes only /webhooks/plane, Linear webhook enabled=false"
        status: pass
    human_judgment: true

metrics:
  started: 2026-07-02T05:13:31Z
  completed: 2026-07-02T05:38:00Z
  duration_seconds: 1469
  tasks: 2
  files_modified: 4
status: complete
---

# Phase 03 Plan 04: Webhook Gating and Plane-Only Env Summary

**External intake is now Plane-only in repository defaults and live deployment exposure.**

## Accomplishments

- Added failing tests for legacy webhook disabled-by-default behavior and explicit compatibility behavior.
- Updated `/webhooks/linear` so it remains present but disabled unless legacy provider compatibility is explicitly configured.
- Updated orchestrator env examples so active defaults are Plane-only and Linear keys are compatibility/migration-only.
- Removed live Linear compatibility from deployed orchestrator env.
- Recreated the API container and confirmed health after env change.
- Reconfigured Tailscale Funnel to expose only `/webhooks/plane`.
- Disabled the existing Linear webhook registration that targeted `/webhooks/linear`.

## Task Commits

1. **Task 1 RED: Legacy webhook gating tests** - `315131c` (test)
2. **Task 1 GREEN: Legacy Linear webhook compatibility gate** - `5849d83` (feat)

## Live Deployment Changes

User approved removing Linear from live exposure. Changes applied on LXC 201:

- Edited `/opt/agent-platform/repo/infra/compose/orchestrator/.env`:
  - `CARD_EXTRA_PROVIDERS=` is now empty.
  - Backup created at `.env.bak-gsd-03-04-linear-removal`.
- Recreated `orchestrator-api-1` with `docker compose up -d api`.
- Reset and recreated Tailscale Funnel with only:
  - `/webhooks/plane -> http://127.0.0.1:3000/webhooks/plane`
- Disabled Linear webhook `7876188c-7893-41e5-be1d-f2f099b6b7eb` via Linear GraphQL `webhookUpdate(enabled: false)`.

## Verification

| Command | Result | Notes |
|---------|--------|-------|
| `rtk corepack pnpm test -- apps/orchestrator-api/src/routes/webhooks.test.ts` | Failed before GREEN | RED evidence: route/env examples still allowed active Linear. |
| `rtk corepack pnpm test -- apps/orchestrator-api/src/routes/webhooks.test.ts` | Passed | Final: 74 files / 468 tests passed under Vitest selection behavior. |
| `rtk corepack pnpm exec biome check apps/orchestrator-api/src/routes/webhooks.ts apps/orchestrator-api/src/routes/webhooks.test.ts` | Passed | Touched webhook files formatted. |
| `grep -nF "webhooks.post('/webhooks/linear'" apps/orchestrator-api/src/routes/webhooks.ts` | Passed | Route support retained. |
| `! grep -nF 'CARD_EXTRA_PROVIDERS=linear' apps/orchestrator-api/.env.example infra/compose/orchestrator/.env.example` | Passed | Env examples no longer enable Linear. |
| `docker inspect orchestrator-api-1 ... CARD_*` | Passed | `CARD_PRIMARY_PROVIDER=plane`, `CARD_EXTRA_PROVIDERS=`. |
| `tailscale funnel status` | Passed | Funnel exposes `/webhooks/plane` only. |
| Linear GraphQL `webhooks` query | Passed | Linear webhook to `/webhooks/linear` exists but `enabled=false`. |
| API health check | Passed | `200 {"status":"ok",...}` after container recreation. |

## Decisions Made

- Disable, not delete, the Linear webhook registration to keep rollback possible while removing active external intake.
- Keep `/webhooks/linear` route support in code per D-05, but require explicit legacy compatibility config.
- Treat live deployment exposure as Plane-only once env, Funnel, and Linear provider UI all agree.

## Deviations from Plan

- `rg` was unavailable in the executor shell, so static checks used equivalent grep commands.
- The checkpoint initially blocked because live deployment still had Linear enabled; user explicitly approved removal, after which the live checkpoint was completed.

## Threat Review

- `T-03-04-01` mitigated: Plane webhook route remains active and tested.
- `T-03-04-02` mitigated: Linear route is gated in code, live Funnel no longer exposes it, and Linear provider webhook is disabled.
- `T-03-04-03` mitigated: env examples no longer present Linear as active default.
- `T-03-04-SC` mitigated: no package installs or route deletion occurred.

## Next Phase Readiness

Plan 03-05 can now finalize schema/data compatibility, dashboards, docs, and the production row audit checkpoint.

## Self-Check: PASSED

- Found created summary: `.planning/phases/03-plane-only-provider-cutover/03-04-SUMMARY.md`.
- Found task commits: `315131c`, `5849d83`.
- Verified repository tests/static checks and live env/Funnel/Linear provider state.
