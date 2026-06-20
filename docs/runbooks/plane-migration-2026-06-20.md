# Plane Migration 2026-06-20

Plane workspace: `attodev`
Plane project: `Agent Platform` (`AGP`)
Plane project ID: `4c671d1f-0836-4423-b50e-d60ed1d02162`

## Bootstrap IDs

- `ai-ready`: `70b19241-dcbb-4808-8029-de3620b1d5e3`
- `approved`: `4cb58637-b838-4907-b300-2e2a12b75dd4`
- `auto-merge`: `48a164d7-8150-4a4c-bb6d-ddc62ccd03ef`
- `scheduled`: `eb08beb7-a1ea-4e5b-8510-4b6c03e9862d`
- `repo:create`: `8a9924dd-528a-414a-8d0e-225df3b4f543`
- `workflow:landing-page`: `252a53aa-c940-4a1d-a981-cc0ac41c92d6`
- `agent:reviewer`: `7fb4b1d8-91cd-4865-b751-8bfb1b04591d`
- `agent:landing-page`: `3ca96c80-f04e-4172-a85e-ee22471e4ec7`
- `agent:data-collector`: `e18291ae-be14-42ef-99d4-7ed476e30182`
- `Improvement`: `0dcdde3b-521b-4aa1-8c6a-5753b1113200`
- `Feature`: `e552b81b-1e58-4cd0-9c84-18f2fa4017a3`
- `Done` state: `5faec6ef-80ed-4d32-9997-f29956d0191f`

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

## Verification

- Build: passed with `rtk corepack pnpm -r build`
- Tests: passed with `rtk corepack pnpm test`
- Lint: passed with `rtk corepack pnpm lint`
- Plane project bootstrap: passed
- Plane migration count: 31 Linear-sourced work items
- Plane smoke card: created `AGP-32` (`8283b513-d832-44aa-a245-10683f1e94f3`)

Real webhook/worker smoke was not executed on this machine because no
orchestrator runtime was listening on `127.0.0.1:3000`, and Postgres/Redis were
not running locally. The branch includes automated Plane webhook coverage in
`apps/orchestrator-api/src/routes/webhooks.test.ts`.
