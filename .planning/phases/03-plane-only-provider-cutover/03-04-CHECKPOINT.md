---
phase: 03-plane-only-provider-cutover
plan: "04"
checkpoint: deployed-env-and-webhook-exposure
status: blocked
recorded_at: "2026-07-02T05:20:00Z"
resume_signal: "Type approved after deployed env and webhook exposure are confirmed, or describe the live-state difference to replan deployment notes."
---

# Phase 03 Plan 04 Checkpoint: Deployed Env and Webhook Exposure

Plan 03-04 Task 1 is complete in the repository, but Task 2 remains blocked on live deployment state. This file records the current read-only evidence without marking `03-04-PLAN.md` complete.

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

## Required Operator Decision

Choose one path before creating `03-04-SUMMARY.md` and advancing to Plan 03-05:

1. Confirm the deployed Linear compatibility/exposure is intentional legacy compatibility for now, and confirm `/webhooks/plane` remains the active Plane intake path.
2. Or remove/disable the live Linear compatibility path outside this agent:
   - remove `CARD_EXTRA_PROVIDERS=linear` from the deployed env or secret store and restart/redeploy the orchestrator;
   - remove `/webhooks/linear` from Tailscale Funnel or keep it only if explicitly intended as compatibility;
   - disable the Linear webhook registration that points to `/webhooks/linear`.

## Resume Signal

Type `approved` after deployed env and webhook exposure are confirmed, or describe the intended live-state difference so Plan 03-04 can be replanned or deployment notes can be updated.
