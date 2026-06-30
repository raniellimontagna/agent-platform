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

## Next Session Checklist

Use this checklist when resuming the Mission Control rollout.

### 1. Sync and Verify Local State

```bash
rtk git switch main
rtk git pull --ff-only origin main
rtk corepack pnpm --filter @agent-platform/orchestrator-api build
rtk corepack pnpm lint
rtk corepack pnpm test
```

Expected: local `main` matches `origin/main`; build, lint, and tests pass.

### 2. Deploy Orchestrator

Deploy the updated orchestrator so the new `/admin/mission-control` routes are
available in the Proxmox environment.

```bash
rtk infra/deploy/deploy.sh orchestrator
```

If deploy fails because of disk pressure on LXC 201, use the disk cleanup notes
in [`proxmox-estado-atual.md`](proxmox-estado-atual.md) before retrying.

### 3. Smoke Mission Control Endpoints

Use the deployed orchestrator URL and the same bearer token used for other
admin endpoints.

```bash
rtk curl -H "Authorization: Bearer <RUNNER_AUTH_TOKEN>" \
  http://<orchestrator-host>:3000/admin/api/mission-control/scenarios

rtk curl -H "Authorization: Bearer <RUNNER_AUTH_TOKEN>" \
  http://<orchestrator-host>:3000/admin/api/mission-control/missions
```

Then open the HTML dashboard in a browser:

```text
http://<orchestrator-host>:3000/admin/mission-control
```

Expected:

- scenarios endpoint returns `research-to-landing`;
- missions endpoint returns recent mission summaries, or an empty list if none
  exist yet;
- dashboard shows read-only rehearsal mode and the safe launch checklist.

### 4. Run One Manual Research-to-Landing E2E

In Plane workspace `attodev`, project `Agent Platform` (`AGP`), create or reuse
a card with:

- `ai-ready`;
- `workflow:landing-page`;
- one explicit public URL in the description;
- optional `repo:create` if the test should create a generated repo;
- no `agent:landing-page` and no `agent:data-collector`.

After the planner comments the initial plan, add `approved` to continue.

Expected E2E evidence:

- the first run has workflow `research_landing_page`;
- the first run stores a `research` artifact;
- the artifact includes `## Landing Page Brief` when evidence exists;
- the orchestrator comments that it started the landing-page continuation;
- the second run uses `landing-page-agent`;
- Mission Control shows the mission progressing into `landing_generation` or
  later;
- the detail page shows artifacts, approval state, continuation state, and PR
  metadata when available.

### 5. Decide the Next Feature Slice

After the first real E2E, choose one follow-up:

- **Run Replay Safe Mode:** replay saved Plane/webhook fixtures without live
  side effects.
- **Mission Filters:** filter dashboard by status, provider, card identifier, or
  scenario.
- **Artifact Inspection:** show artifact excerpts and source links directly in
  Mission Control.
- **Operator Actions:** add explicit, tested controls for approve/retry/cancel.
  Do this only after read-only behavior has been validated.
