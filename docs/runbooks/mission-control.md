# E2E Studio Mission Control Runbook

Mission Control is the internal admin surface for inspecting supported E2E
workflows and recent runs. The first version is intentionally read-only: it
describes scenarios, shows mission state, and helps an operator rehearse a safe
manual launch without triggering Plane, webhooks, GitHub, or live agent runs.

## Scope

Use Mission Control to:

- review registered E2E scenarios and their required labels;
- inspect recent mission summaries and per-run timeline state;
- check artifacts, approval state, PR metadata, and continuation status;
- read the safe launch checklist for the `research-to-landing` scenario.

Do not use this version to start or replay work. Any real E2E run still starts
from Plane labels and the existing webhook/scheduler path described in
[`research-to-landing-workflow.md`](research-to-landing-workflow.md).

## Access

Mission Control lives under the protected orchestrator admin routes:

- `/admin/mission-control` for the dashboard;
- `/admin/mission-control/missions/:runId` for a mission detail page;
- `/admin/api/mission-control/scenarios` for read-only scenario data;
- `/admin/api/mission-control/missions` for recent mission summaries.

Use the same admin authentication pattern as the existing `/admin` pages. If the
admin token or deployment URL is unknown, check the environment inventory in
[`secrets.md`](secrets.md) before attempting access.

## Ralph Workflow

Ralph is the implementation loop used for this Mission Control PRD. The active
state is in:

- `scripts/ralph/prd.json` for ordered stories and pass state;
- `scripts/ralph/progress.txt` for append-only iteration notes and reusable
  codebase patterns.

Inspect current story state:

```bash
rtk node -e "const p=require('./scripts/ralph/prd.json'); console.log(p.userStories.map(s => ({id:s.id,title:s.title,passes:s.passes})))"
rtk read scripts/ralph/progress.txt
```

Run Ralph from a clean worktree:

```bash
rtk scripts/ralph/ralph.sh --tool codex --dry-run 1
rtk scripts/ralph/ralph.sh --tool codex 10
```

Each Codex iteration should complete exactly one `passes=false` story, run that
story's checks, update `prd.json`, append `progress.txt`, and commit only after
verification passes. The Mission Control branch for this PRD is
`feat/agp-e2e-studio-mission-control`.

## Manual Research-to-Landing Launch

Mission Control does not launch the workflow. To run the E2E manually, create or
update a Plane card in the `Agent Platform` project with:

- required label `ai-ready`;
- required label `workflow:landing-page`;
- optional label `repo:create` when the workflow should create a final repo;
- public company, product, pricing, docs, Instagram, LinkedIn, or other relevant
  URLs in the card body;
- optional `TARGET_REPO_NAME: name` for a new repo;
- optional `TARGET_REPO: attodevlabs/name` for an existing repo;
- approval text `approved` after reviewing the initial plan.

Do not add `agent:landing-page` or `agent:data-collector`; the workflow label
selects the collector first and the landing-page continuation second.

## Expected Evidence

Collect these signals when validating a manual run:

- first run uses workflow value `research_landing_page`;
- first run completes without a PR and stores a `research` artifact;
- research artifact includes a `Landing Page Brief` section when briefing data is
  available;
- orchestrator comments that the landing-page continuation started;
- second run uses `landing-page-agent` and receives the brief before the full
  research pack;
- second run either opens a Draft PR or records why human approval is required;
- Mission Control dashboard shows the scenario and current mission stage state;
- mission detail page shows artifacts, approval state, continuation state, and
  PR/deploy metadata when present.

Known limitation for this slice: Mission Control cannot replay, approve, cancel,
or launch runs. Those actions remain future work and should be added only behind
explicit operator controls and tests.

## Verification

For docs-only changes, run:

```bash
rtk corepack pnpm exec biome check docs/runbooks/mission-control.md docs/runbooks/ralph-codex.md --no-errors-on-unmatched
```

For Mission Control code changes, also run the affected orchestrator API tests
and typecheck:

```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/admin.test.ts
rtk corepack pnpm --filter @agent-platform/orchestrator-api typecheck
```
