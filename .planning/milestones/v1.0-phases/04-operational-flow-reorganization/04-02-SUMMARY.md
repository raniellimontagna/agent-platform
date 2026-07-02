---
phase: 04-operational-flow-reorganization
plan: "02"
subsystem: operational-source-ownership
tags: [docs, plane, agent-skills, model-aliases, registry, artifacts]

requires:
  - phase: 04-operational-flow-reorganization
    provides: Plane-first flow docs and active operational surface map from 04-01
provides:
  - Canonical source-owner maps for workflow labels, Plane labels, agent keys, skill bundles, model aliases, runner paths, artifact paths, and env/secrets
  - Focused registry compatibility tests for `coder-agent` and `software-delivery-pipeline`
  - Tracked local `gsd` skill artifact required by the committed registry mapping
  - Current docs and runbook indexes that keep historical docs separate from active Plane-first guidance
affects: [phase-04, phase-05, phase-06, operator-docs, agent-skills, registry]

tech-stack:
  added: []
  patterns:
    - Current docs link to code/config owners instead of duplicating mutable runtime values.
    - `coder-agent` remains the compatibility key while `software-delivery-pipeline` is the clearer current identity.
    - Registry compatibility is protected by focused source tests.

key-files:
  created:
    - .planning/phases/04-operational-flow-reorganization/04-02-SUMMARY.md
    - agent-skills/gsd/SKILL.md
  modified:
    - docs/README.md
    - docs/CURRENT.md
    - docs/HISTORICAL.md
    - docs/runbooks/README.md
    - docs/runbooks/agent-skills.md
    - agent-skills/registry.json
    - apps/worker-code/src/executor/agentSkills.test.ts

key-decisions:
  - "Use existing owner files instead of adding a new constants package for workflow labels, agent keys, skills, models, env, runner paths, or artifacts."
  - "Keep `coder-agent` as a compatibility alias and document `software-delivery-pipeline` as the current clearer identity."
  - "Preserve pre-existing dirty 04-02 registry/test/runbook hunks and layer only verification-backed additions."

patterns-established:
  - "Docs source-of-truth tables must point at code/config owners and avoid copying live IDs or secrets."
  - "Software pipeline registry compatibility requires identical `coder-agent` and `software-delivery-pipeline` skill bundles."

requirements-completed: [FLOW-03, FLOW-04]

coverage:
  - id: D1
    description: "Current docs and runbook indexes name canonical source owners for workflow labels, Plane labels, agent keys, skills, model aliases, runner paths, artifact paths, and env/secrets."
    requirement: FLOW-04
    verification:
      - kind: other
        ref: "rtk rg owner-link checks across docs/README.md docs/CURRENT.md docs/runbooks/README.md docs/runbooks/agent-skills.md"
        status: pass
      - kind: other
        ref: "rtk corepack pnpm exec biome check docs/README.md docs/CURRENT.md docs/HISTORICAL.md docs/runbooks/README.md docs/runbooks/agent-skills.md --no-errors-on-unmatched"
        status: pass
    human_judgment: false
  - id: D2
    description: "`coder-agent` and `software-delivery-pipeline` resolve to identical software/GSD skill bundles while landing and research agents stay specialized."
    requirement: FLOW-04
    verification:
      - kind: unit
        ref: "apps/worker-code/src/executor/agentSkills.test.ts#mantem coder-agent como alias compativel do pipeline de software"
        status: pass
      - kind: unit
        ref: "apps/worker-code/src/executor/agentSkills.test.ts#mantem bundles especializados para landing e research"
        status: pass
      - kind: other
        ref: "rtk node -e registry equality check"
        status: pass
    human_judgment: false
  - id: D3
    description: "Historical docs remain indexed separately and do not compete with current Plane-first operating guidance."
    requirement: FLOW-03
    verification:
      - kind: other
        ref: "rtk rg -q \"docs/HISTORICAL.md\" docs/README.md"
        status: pass
    human_judgment: false

metrics:
  started: 2026-07-02T13:48:25Z
  completed: 2026-07-02T13:55:41Z
  duration_seconds: 436
  tasks: 2
  files_modified: 8
status: complete
---

# Phase 04 Plan 02: Source Ownership Normalization Summary

**Operational docs now point to canonical code/config owners, and the software pipeline skill registry is compatibility-tested.**

## Performance

- **Duration:** 7m16s
- **Started:** 2026-07-02T13:48:25Z
- **Completed:** 2026-07-02T13:55:41Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Added canonical source-owner maps to current docs and runbook indexes for labels, agent keys, skills, model aliases, runner paths, artifacts, and env/secrets.
- Preserved the existing local `gsd` software pipeline registry addition and added focused tests for exact `coder-agent` / `software-delivery-pipeline` bundle equality.
- Tracked the local `gsd` skill file referenced by the registry so clean checkouts do not depend on an untracked workspace directory.
- Kept historical docs indexed separately from active Plane-first guidance.

## Task Commits

1. **Task 1: Update current docs indexes with canonical source owners** - `c21ec88` (docs)
2. **Task 2 RED: Preserve registry compatibility and focused source tests** - `3caffc2` (test)
3. **Task 2 GREEN: Preserve registry compatibility and current identity docs** - `f22a78d` (feat)
4. **Post-plan integration: Track registry skill artifact** - this commit

## Files Created/Modified

- `docs/README.md` - Added the top-level current/historical map and canonical source-owner table.
- `docs/CURRENT.md` - Added canonical source-owner table and marked registry/skills as active.
- `docs/HISTORICAL.md` - Added historical index and source-owner rule.
- `docs/runbooks/README.md` - Added runbook source-owner map for mutable operational concepts.
- `docs/runbooks/agent-skills.md` - Added owner references for agents, models, runner artifacts, workflows, Plane label IDs, and artifact APIs; clarified current pipeline identity.
- `agent-skills/registry.json` - Preserved the local `gsd` skill entry and identical software pipeline bundles.
- `agent-skills/gsd/SKILL.md` - Local GSD operating contract referenced by the registry.
- `apps/worker-code/src/executor/agentSkills.test.ts` - Added focused compatibility, specialization, and docs wording tests.

## Verification

| Command | Result | Notes |
|---------|--------|-------|
| `rtk corepack pnpm exec biome check docs/README.md docs/CURRENT.md docs/HISTORICAL.md docs/runbooks/README.md docs/runbooks/agent-skills.md --no-errors-on-unmatched` | Passed | Biome reported 0 matching Markdown files and no errors. |
| Task 1 static owner `rtk rg -q` checks | Passed | Verified owner links for workflows, Plane migration labels, agents, registry, model aliases, runner env, `RUNNER_ARTIFACTS_DIR`, secrets, artifacts, routes, and `docs/HISTORICAL.md`. |
| RED `rtk corepack pnpm vitest run apps/worker-code/src/executor/agentSkills.test.ts` | Failed as expected | 8/9 tests passed; docs identity wording assertion failed before the runbook update. |
| `rtk corepack pnpm vitest run apps/worker-code/src/executor/agentSkills.test.ts apps/orchestrator-api/src/agents.test.ts apps/orchestrator-api/src/workflows.test.ts packages/graph/src/roleModels.test.ts packages/llm/src/cost.test.ts` | Passed | 5 files / 36 tests passed after GREEN. |
| `rtk node -e ... registry equality check` | Passed | `coder-agent` and `software-delivery-pipeline` bundles are byte-identical JSON arrays. |
| `rtk grep -q "coder-agent" docs/runbooks/agent-skills.md` and `rtk grep -q "software-delivery-pipeline" docs/runbooks/agent-skills.md` | Passed | Runbook names both compatibility and current identity. |
| Final plan-level static owner checks | Passed | Required owner paths remain present after commits. |
| `rtk corepack pnpm verify` | Passed | Biome checked 225 files; recursive build passed; Vitest 74 files / 477 tests passed; eval and regression eval both 14/14 score 100. |
| Post-plan `rtk corepack pnpm vitest run apps/worker-code/src/executor/agentSkills.test.ts` | Passed | Confirmed the tracked local `gsd` skill still satisfies the registry compatibility tests. |

## Decisions Made

- Did not introduce a new source-owner abstraction; docs point to existing owner files.
- Kept `coder-agent` as the compatibility alias and `software-delivery-pipeline` as the current conceptual identity.
- Did not edit Phase 5/6 production modules or remove compatibility aliases.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `rtk` warned that project filters are untrusted on project commands. The warning did not block execution and was not changed.
- The first GREEN test run failed because Markdown line wrapping split the expected identity phrase. The runbook sentence was adjusted and the exact focused command passed.
- Full verify emitted existing test stderr/log lines for mocked DB/Redis and fallback paths, but the command exited 0.

## Dirty Worktree Handling

- Pre-existing dirty hunks in `agent-skills/registry.json`, `apps/worker-code/src/executor/agentSkills.test.ts`, and `docs/runbooks/agent-skills.md` were preserved and layered on.
- Pre-existing untracked `docs/README.md`, `docs/HISTORICAL.md`, and `docs/runbooks/README.md` were in 04-02 scope and were committed as Task 1 artifacts.
- Unrelated untracked planning/archive files and `docs/superpowers/README.md` were left untouched.
- Pre-existing untracked `agent-skills/gsd/` was later tracked as a post-plan integration fix because the committed registry maps to `agent-skills/gsd/SKILL.md`.

## Known Stubs

None. Stub scan across the changed 04-02 files found no `TODO`, `FIXME`, `placeholder`, `coming soon`, `not available`, or hardcoded empty-value UI patterns.

## Threat Review

- `T-04-02-01` mitigated: current docs link mutable labels/keys/models/artifacts to canonical owner files.
- `T-04-02-02` mitigated: registry compatibility is verified by focused tests and no dynamic package downloads were added.
- `T-04-02-03` mitigated: docs point to `.env.example` files and `docs/runbooks/secrets.md` instead of copying secret values.
- `T-04-02-04` mitigated: workflow and agent naming docs point to `workflows.ts` and `agents.ts`.
- `T-04-02-SC` mitigated: no package installs occurred.

No new runtime endpoint, auth path, schema change, or file-access trust boundary was introduced; no threat flags were added.

## Residual Risks

- Biome currently reports 0 matching Markdown files for the docs-only checks, so static `rtk rg` owner checks are the primary docs-specific automated evidence.

## TDD Gate Compliance

- RED commit present: `3caffc2`.
- GREEN commit present after RED: `f22a78d`.
- No refactor commit was needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 4 is complete. Phase 5 can start orchestrator hub refactors using the current owner maps and registry compatibility tests as guardrails.

## Self-Check: PASSED

- Found summary: `.planning/phases/04-operational-flow-reorganization/04-02-SUMMARY.md`.
- Found modified files: `docs/README.md`, `docs/CURRENT.md`, `docs/HISTORICAL.md`, `docs/runbooks/README.md`, `docs/runbooks/agent-skills.md`, `agent-skills/registry.json`, and `apps/worker-code/src/executor/agentSkills.test.ts`.
- Found task commits: `c21ec88`, `3caffc2`, and `f22a78d`.
- Final verification passed with `rtk corepack pnpm verify`.
