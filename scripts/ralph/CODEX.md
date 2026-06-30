# Ralph Agent Instructions for Codex

You are Codex running one autonomous Ralph iteration inside the
`agent-platform` repository.

## Project Rules

Before doing any task work:

1. Read root `AGENTS.md`.
2. Read root `CLAUDE.md`.
3. Follow the project's branch, commit, Plane sync, and RTK rules.
4. Use `rtk` for shell commands whenever possible.
5. Preserve unrelated user changes. Never revert changes you did not make.

## Ralph State

Use these files:

- PRD: `scripts/ralph/prd.json`
- Progress log: `scripts/ralph/progress.txt`
- Example format: `scripts/ralph/prd.json.example`

Read `scripts/ralph/progress.txt` before choosing a story. If it contains a
`## Codebase Patterns` section, treat those bullets as high-priority local
instructions for this Ralph run.

## Your Task

1. Read `scripts/ralph/prd.json`.
2. Confirm the current git branch matches `branchName` from the PRD. If it
   exists, switch to it. If it does not exist, create it from the current HEAD
   so the project-local Ralph files remain available to the new branch.
3. Pick the highest-priority `userStories[]` item where `passes` is `false`.
4. Implement exactly that one story.
5. Use the relevant Superpowers workflow for the work:
   - For feature or bugfix code, use test-driven development.
   - Before claiming completion, run verification and inspect the output.
   - If you hit an unexpected failure, use systematic debugging.
6. Run the story's acceptance checks plus the smallest relevant project checks.
7. Commit only after checks pass.
8. Update `scripts/ralph/prd.json` for the completed story:
   - set `passes` to `true`;
   - add a short `notes` value with the verification command that passed.
9. Append a progress entry to `scripts/ralph/progress.txt`.
10. If every story now has `passes: true`, respond with exactly:

```xml
<promise>COMPLETE</promise>
```

If unfinished stories remain, end normally without the completion promise.

## Progress Entry Format

Append to `scripts/ralph/progress.txt`:

```markdown
## YYYY-MM-DD HH:MM - US-XXX
- What was implemented.
- Files changed:
  - path/to/file
- Verification:
  - `rtk command that passed`
- Learnings for future iterations:
  - Reusable pattern or gotcha, if any.
---
```

If you discover a durable pattern that future iterations should know, also add
it under `## Codebase Patterns` near the top of `progress.txt`. Only add
general reusable knowledge, not story-specific notes.

## Quality Requirements

- Work on one story per iteration.
- Keep changes focused.
- Do not mark a story as passed unless verification passed in this iteration.
- Do not commit broken code.
- Do not make broad refactors unless the selected story explicitly requires it.
- For UI stories, verify in browser when a dev server and browser tool are
  available; otherwise record the missing browser verification in `notes`.
- Do not create Plane cards or change Plane statuses unless the selected story
  explicitly requires it.

## Commit Format

Use this commit message shape:

```text
feat(ralph): US-XXX - story title
```

Use a different Conventional Commit type when the story is clearly docs, chore,
fix, refactor, or test.
