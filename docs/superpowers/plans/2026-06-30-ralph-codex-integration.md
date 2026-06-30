# Ralph Codex Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install Ralph locally and adapt it to run autonomous one-story Codex iterations that fit the agent-platform Superpowers workflow.

**Architecture:** Keep Ralph as a versioned project-local script under `scripts/ralph/`. Extend the shell runner with `--tool codex`, `--dry-run`, and `--help`, and add a Codex prompt template that uses repository-root paths for PRD/progress state.

**Tech Stack:** Bash, Codex CLI, Node.js fallback for JSON parsing, Markdown docs, existing RTK command conventions.

## Global Constraints

- Ralph state must live in `scripts/ralph/`.
- Codex support must use `codex exec`.
- The runner may use `jq` when available, but must fall back to Node.js for
  `branchName` parsing.
- The runner must keep upstream Amp and Claude modes available.
- The Codex prompt must require `CLAUDE.md`, `AGENTS.md`, RTK, one-story execution, validation, commit, PRD update, and progress append.
- No orchestrator, Plane, or database integration in this iteration.
- Use `rtk` for commands.

---

### Task 1: Install Ralph Files Locally

**Files:**
- Create: `scripts/ralph/ralph.sh`
- Create: `scripts/ralph/prompt.md`
- Create: `scripts/ralph/CLAUDE.md`
- Create: `scripts/ralph/prd.json.example`
- Create: `scripts/ralph/progress.txt`

**Interfaces:**
- Produces a project-local Ralph directory with upstream-compatible files.

- [ ] **Step 1: Copy upstream Ralph runtime files**

Copy from `/tmp/ralph-inspect`:

```bash
mkdir -p scripts/ralph
cp /tmp/ralph-inspect/ralph.sh scripts/ralph/ralph.sh
cp /tmp/ralph-inspect/prompt.md scripts/ralph/prompt.md
cp /tmp/ralph-inspect/CLAUDE.md scripts/ralph/CLAUDE.md
cp /tmp/ralph-inspect/prd.json.example scripts/ralph/prd.json.example
```

- [ ] **Step 2: Initialize progress file**

Create `scripts/ralph/progress.txt` with:

```markdown
# Ralph Progress Log
Started: not started
---
```

- [ ] **Step 3: Make the runner executable**

Run:

```bash
chmod +x scripts/ralph/ralph.sh
```

Expected: command exits 0.

### Task 2: Add Codex and Dry-Run Support

**Files:**
- Modify: `scripts/ralph/ralph.sh`

**Interfaces:**
- Produces CLI options:
  - `--tool codex`
  - `--dry-run`
  - `--help`
- Produces helper:
  - `read_branch_name(): string`

- [ ] **Step 1: Add argument parsing**

Update the runner to accept:

```bash
--tool amp|claude|codex
--dry-run
--help
```

- [ ] **Step 2: Add Codex command branch**

For Codex iterations, run:

```bash
codex exec --cd "$PROJECT_ROOT" --sandbox danger-full-access --ask-for-approval never "$(cat "$SCRIPT_DIR/CODEX.md")"
```

- [ ] **Step 3: Add dry-run behavior**

When `--dry-run` is set, print the selected command and exit 0 before starting
the iteration loop.

- [ ] **Step 4: Add Node fallback for branch parsing**

Add `read_branch_name()` so the script uses `jq` when present and otherwise
uses `node` to read `.branchName` from `scripts/ralph/prd.json`.

- [ ] **Step 5: Verify shell syntax**

Run:

```bash
rtk bash -n scripts/ralph/ralph.sh
```

Expected: exit 0.

- [ ] **Step 6: Verify dry-run**

Run:

```bash
rtk scripts/ralph/ralph.sh --tool codex --dry-run 1
```

Expected: prints a Codex command containing `codex exec`, `--cd /root/agent-platform`,
`--sandbox danger-full-access`, and `--ask-for-approval never`.

### Task 3: Add Codex Prompt and Documentation

**Files:**
- Create: `scripts/ralph/CODEX.md`
- Create: `docs/runbooks/ralph-codex.md`

**Interfaces:**
- Produces Codex iteration instructions and operator docs for Superpowers to
  Ralph execution.

- [ ] **Step 1: Create `CODEX.md`**

The prompt must instruct Codex to read `scripts/ralph/prd.json` and
`scripts/ralph/progress.txt`, execute only one unfinished story, validate,
commit, update PRD/progress, and emit `<promise>COMPLETE</promise>` only when all
stories pass.

- [ ] **Step 2: Create runbook**

Document:

- prerequisites: Codex CLI, Node.js, clean git tree, optional `jq`;
- creating a Superpowers spec/plan;
- converting plan work into `scripts/ralph/prd.json`;
- running `scripts/ralph/ralph.sh --tool codex`;
- checking `scripts/ralph/progress.txt`;
- keeping stories small.

- [ ] **Step 3: Verify docs are readable**

Run:

```bash
rtk read scripts/ralph/CODEX.md docs/runbooks/ralph-codex.md
```

Expected: both files render with project-specific instructions and no
placeholders.

### Task 4: Final Verification

**Files:**
- All files from Tasks 1-3

**Interfaces:**
- Confirms the local Ralph integration is usable without invoking a real Codex
  autonomous run.

- [ ] **Step 1: Run dry-run and syntax checks**

Run:

```bash
rtk bash -n scripts/ralph/ralph.sh
rtk scripts/ralph/ralph.sh --help
rtk scripts/ralph/ralph.sh --tool codex --dry-run 1
```

Expected: all commands exit 0.

- [ ] **Step 2: Run repository lint**

Run:

```bash
rtk corepack pnpm lint
```

Expected: exit 0.

- [ ] **Step 3: Review git diff**

Run:

```bash
rtk git diff --stat
rtk git diff -- scripts/ralph docs/runbooks/ralph-codex.md docs/superpowers/specs/2026-06-30-ralph-codex-integration-design.md docs/superpowers/plans/2026-06-30-ralph-codex-integration.md
```

Expected: only Ralph integration docs/scripts changed.

## Self-Review

- Spec coverage: all requirements map to one of the four tasks.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: CLI option names and file paths are consistent across the
  spec, plan, script, prompt, and docs.
