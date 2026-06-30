# Ralph Codex Integration Design

Date: 2026-06-30

## Goal

Install Ralph locally in this repository and adapt it so Codex can run Ralph
iterations against `prd.json` stories while preserving this project's existing
Superpowers, RTK, branch, validation, and commit conventions.

## Context

Ralph is an autonomous loop that repeatedly starts a fresh coding agent, reads a
small PRD JSON file, completes one unfinished user story, validates, commits,
updates progress, and repeats. Upstream supports Amp and Claude Code. This
project uses Codex in the local development workflow and already stores larger
design and implementation artifacts under `docs/superpowers`.

## Approach

Copy the upstream Ralph runtime into `scripts/ralph/` and keep it versioned as a
project-local tool. Add `--tool codex` support to the shell runner, using
`codex exec` with this repository as the working directory. Add a Codex-specific
prompt template that tells each fresh iteration to follow `CLAUDE.md`, use
`rtk`, read the Ralph PRD/progress files, work on exactly one story, run
verification, and update progress.

Ralph state stays local to `scripts/ralph/`:

- `prd.json`: active ordered user stories.
- `progress.txt`: append-only execution memory.
- `archive/`: previous PRD/progress snapshots when the active branch changes.

Superpowers remains the design/planning layer. The expected flow is:

1. Write or approve a spec under `docs/superpowers/specs`.
2. Write a plan under `docs/superpowers/plans`.
3. Convert the implementation work into small Ralph stories in
   `scripts/ralph/prd.json`.
4. Run `scripts/ralph/ralph.sh --tool codex`.

## Non-Goals

- Do not integrate Ralph into the orchestrator runtime in this iteration.
- Do not add a Plane workflow or webhook path for Ralph yet.
- Do not install global Claude Code or Amp plugins.
- Do not make Ralph bypass project validation, branch rules, or commit rules.
- Do not use Ralph to run multiple stories in one Codex iteration.

## Codex Runtime Command

The Codex runner should call:

```bash
codex exec --cd "$PROJECT_ROOT" --sandbox danger-full-access --ask-for-approval never "$(cat "$SCRIPT_DIR/CODEX.md")"
```

This keeps each iteration non-interactive and lets the prompt reference
`scripts/ralph/prd.json` and `scripts/ralph/progress.txt` with stable paths.

## Prompt Requirements

`scripts/ralph/CODEX.md` must instruct Codex to:

- follow root `CLAUDE.md` and `AGENTS.md`;
- use `rtk` for commands;
- read `scripts/ralph/prd.json`;
- read `scripts/ralph/progress.txt`, especially `## Codebase Patterns`;
- ensure the correct branch from `branchName`;
- pick the highest-priority story where `passes` is `false`;
- implement only that story;
- run relevant checks;
- update `scripts/ralph/prd.json` to mark the story as passed only after checks
  pass;
- append progress and reusable learnings;
- emit `<promise>COMPLETE</promise>` only when all stories pass.

## Runtime Dependencies

The runner may use `jq` when available, but it must also work with the Node.js
runtime already required by this repository. `branchName` extraction should fall
back to `node` so a fresh clone of agent-platform does not require a system
package install before Ralph can start.

## Verification

The integration is considered installed when:

- `scripts/ralph/ralph.sh --help` or argument parsing works without running an
  agent;
- `scripts/ralph/ralph.sh --tool codex --dry-run 1` prints the Codex command it
  would run without invoking Codex;
- `scripts/ralph/ralph.sh --tool codex --dry-run 1` does not require `jq`;
- `bash -n scripts/ralph/ralph.sh` passes;
- docs explain the Superpowers to Ralph workflow;
- repository lint still passes for markdown/shell additions where applicable.

## Future Work

- Add a converter from `docs/superpowers/plans/*.md` to Ralph `prd.json`.
- Add a Plane card workflow that creates or updates Ralph PRDs.
- Add Mission Control E2E Studio as the first real Ralph-driven feature.
