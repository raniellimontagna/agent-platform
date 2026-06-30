# Ralph + Codex Runbook

Ralph is installed locally in `scripts/ralph/` as an autonomous one-story loop
for Codex. It is intended for large features that have already been decomposed
through the project's Superpowers-style spec and plan process.

## Files

| Path | Purpose |
| --- | --- |
| `scripts/ralph/ralph.sh` | Ralph loop runner. Supports `--tool codex`. |
| `scripts/ralph/CODEX.md` | Prompt passed to each fresh Codex iteration. |
| `scripts/ralph/prd.json` | Active ordered story list. Created per feature. |
| `scripts/ralph/prd.json.example` | Example JSON format. |
| `scripts/ralph/progress.txt` | Append-only memory between iterations. |
| `scripts/ralph/archive/` | Previous run snapshots when `branchName` changes. |

## Prerequisites

- Clean git tree before starting a new Ralph run.
- Codex CLI authenticated locally.
- Node.js available. `jq` is optional; the runner falls back to Node.js for
  `branchName` parsing.
- A Superpowers spec in `docs/superpowers/specs/`.
- A Superpowers implementation plan in `docs/superpowers/plans/`.

## Workflow

1. Create or approve a design spec.
2. Create an implementation plan.
3. Convert the plan into small Ralph stories in `scripts/ralph/prd.json`.
4. Run a dry-run:

```bash
rtk scripts/ralph/ralph.sh --tool codex --dry-run 1
```

5. Start Ralph:

```bash
rtk scripts/ralph/ralph.sh --tool codex 10
```

Ralph starts a fresh `codex exec` process per iteration. Each process reads the
same PRD and progress log, completes one unfinished story, validates, commits,
updates `prd.json`, appends to `progress.txt`, and exits.

The Codex invocation uses `--dangerously-bypass-approvals-and-sandbox`, so run it
only in a repository and machine context where autonomous edits are acceptable.

## PRD Shape

Use `scripts/ralph/prd.json.example` as the base. Keep stories small enough for
one Codex iteration.

```json
{
  "project": "agent-platform",
  "branchName": "feat/agp-e2e-studio-mission-control",
  "description": "E2E Studio Mission Control",
  "userStories": [
    {
      "id": "US-001",
      "title": "Add E2E scenario registry",
      "description": "As an operator, I need reusable scenario definitions for E2E runs.",
      "acceptanceCriteria": [
        "Add typed scenario definitions for research-to-landing smoke runs",
        "Unit tests cover scenario ordering and required labels",
        "Typecheck passes"
      ],
      "priority": 1,
      "passes": false,
      "notes": ""
    }
  ]
}
```

## Story Rules

- One story must be one independently verifiable change.
- Earlier stories must not depend on later stories.
- Every story needs concrete acceptance criteria.
- Add `Tests pass` for testable logic.
- Add browser verification criteria for UI stories.
- Do not use broad stories such as "build the dashboard"; split into registry,
  API, view model, first screen, timeline, filters, and polish.

## Superpowers Integration

Superpowers remains the source of design discipline. Ralph is only the execution
loop.

Recommended order:

1. `docs/superpowers/specs/YYYY-MM-DD-feature-design.md`
2. `docs/superpowers/plans/YYYY-MM-DD-feature.md`
3. `scripts/ralph/prd.json`
4. `scripts/ralph/ralph.sh --tool codex`

For the E2E Studio Mission Control feature, start by converting the plan into
stories such as scenario registry, run replay API, timeline data, Mission
Control shell, gamified status treatment, and verification.

## Debugging

Check current Ralph state:

```bash
rtk node -e "const p=require('./scripts/ralph/prd.json'); console.log(p.userStories.map(s => ({id:s.id,title:s.title,passes:s.passes})))"
rtk read scripts/ralph/progress.txt
rtk git log --oneline -10
```

If a story fails repeatedly, stop Ralph, inspect `progress.txt`, fix the story
definition or plan, then resume with the same command.
