---
phase: 03-plane-only-provider-cutover
plan: "04"
checkpoint: deployed-env-and-webhook-exposure
status: resolved
recorded_at: "2026-07-02T05:20:00Z"
resolved_at: "2026-07-02T05:38:00Z"
---

# Phase 03 Plan 04 Checkpoint: Deployed Env and Webhook Exposure

Plan 03-04 Task 1 completed in the repository, and Task 2 was later resolved after explicit user approval to remove live Linear exposure. This file preserves the original checkpoint evidence and the final resolution.

## Automated Work Completed

- `315131c test(03-04): add legacy webhook gating tests`
- `5849d83 feat(03-04): gate legacy Linear webhook compatibility`

Verification reported by the executor:

- `rtk corepack pnpm test -- apps/orchestrator-api/src/routes/webhooks.test.ts` passed after implementation.
- `rtk corepack pnpm exec biome check apps/orchestrator-api/src/routes/webhooks.ts apps/orchestrator-api/src/routes/webhooks.test.ts` passed.
- Static grep fallback confirmed `/webhooks/linear` route support remains and env examples no longer include `CARD_EXTRA_PROVIDERS=linear`.

## Read-Only Live Evidence

Collected from LXC 201 and the deployed Linear API key without mutating deployed env, Tailscale, or Linear provider settings:

- Deployed orchestrator env:
  - `CARD_PRIMARY_PROVIDER=plane`
  - `CARD_EXTRA_PROVIDERS=linear`
  - `LINEAR_API_KEY` is present.
- Tailscale Funnel on `agent-orchestrator.tail85607e.ts.net` exposes:
  - `/webhooks/plane -> http://127.0.0.1:3000/webhooks/plane`
  - `/webhooks/linear -> http://127.0.0.1:3000/webhooks/linear`
- Linear GraphQL `webhooks` returned one enabled webhook:
  - id: `7876188c-7893-41e5-be1d-f2f099b6b7eb`
  - label: `agent-platform ai-ready`
  - URL path: `https://agent-orchestrator.tail85607e.ts.net/webhooks/linear`
  - enabled: `true`
  - resource types: `Issue`
  - created and updated: `2026-06-12T02:14:33.830Z`

## Why This Blocks

The plan requires confirming deployed env and webhook exposure do not leave Linear active unintentionally. Current live state proves Linear compatibility is still explicitly enabled and externally exposed:

- `CARD_EXTRA_PROVIDERS=linear` keeps legacy compatibility enabled in the deployed process.
- Tailscale Funnel exposes `/webhooks/linear`.
- Linear has an enabled webhook pointing to `/webhooks/linear`.

This may be valid if the operator intentionally wants legacy compatibility during the cutover, but the plan cannot infer that intent from repository state or read-only inspection.

## Resolution

User approved removing Linear from live exposure. The following changes were applied on LXC 201:

- `CARD_EXTRA_PROVIDERS=` is now empty in the deployed compose env and in the recreated `orchestrator-api-1` container.
- Tailscale Funnel now exposes only `/webhooks/plane`.
- Linear webhook `7876188c-7893-41e5-be1d-f2f099b6b7eb` now has `enabled=false`.
- API health returned 200 after the API container was recreated.

## Final State

This checkpoint is resolved. See `.planning/phases/03-plane-only-provider-cutover/03-04-SUMMARY.md` for plan completion evidence.
