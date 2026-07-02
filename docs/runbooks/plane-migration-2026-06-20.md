# Plane Migration 2026-06-20

Plane workspace: `attodev`
Plane project: `Agent Platform` (`AGP`)
Plane project ID: `<uuid>`

## Bootstrap IDs

- `ai-ready`: `<uuid>`
- `approved`: `<uuid>`
- `auto-merge`: `<uuid>`
- `scheduled`: `<uuid>`
- `repo:create`: `<uuid>`
- `workflow:landing-page`: `<uuid>`
- `agent:reviewer`: `<uuid>`
- `agent:landing-page`: `<uuid>`
- `agent:data-collector`: `<uuid>`
- `Improvement`: `<uuid>`
- `Feature`: `<uuid>`
- `Done` state: `<uuid>`

## Migration Result

- Source: Linear connector, team `MAC`, active states `Todo`, `Backlog`, and `In Progress`.
- Created: 31
- Skipped existing: 0
- Failed: 0

The `plane:migrate-linear` CLI could not be used on this host because no
`LINEAR_API_KEY` was available in local environment files. The cards were
migrated through the configured Linear connector and Plane MCP/API, preserving
`external_source=linear`, each `MAC-*` external ID, title, state, priority, and
matching labels.

## Current Compatibility Notes

As of 2026-07-02, Plane is the only active provider for new work. Linear data is
retained as migration provenance and old-row compatibility only.

- `plane:migrate-linear` remains the supported seam for Linear-to-Plane
  migration work.
- `linear_issue_id` and `linear_issue_identifier` remain in the `runs` table so
  old rows stay readable while `card_id`, `card_identifier`, and
  `card_provider` are authoritative for new rows.
- `/webhooks/linear` is compatibility-only and should stay disabled unless a
  deliberate rollback window enables `CARD_EXTRA_PROVIDERS=linear` and exposes
  that path.
- Do not drop or rename legacy Linear columns until a read-only production row
  audit is recorded and a separate destructive cleanup confirmation exists.

## Verification

- Build: passed with `rtk corepack pnpm -r build`
- Tests: passed with `rtk corepack pnpm test`
- Lint: passed with `rtk corepack pnpm lint`
- Plane project bootstrap: passed
- Plane migration count: 31 Linear-sourced work items
- Plane smoke card: created `AGP-32` (`<uuid>`)

Real webhook/worker smoke was not executed on this machine because no
orchestrator runtime was listening on `127.0.0.1:3000`, and Postgres/Redis were
not running locally. The branch includes automated Plane webhook coverage in
`apps/orchestrator-api/src/routes/webhooks.test.ts`.
