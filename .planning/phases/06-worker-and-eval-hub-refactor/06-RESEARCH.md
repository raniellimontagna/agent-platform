# Phase 06: worker-and-eval-hub-refactor - Research

**Researched:** 2026-07-02
**Domain:** TypeScript worker execution, codegen, research providers, and eval harness refactor
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md) [VERIFIED: .planning/phases/06-worker-and-eval-hub-refactor/06-CONTEXT.md]

### Locked Decisions

## Implementation Decisions

### Refactor Posture

- **D-01:** Treat Phase 6 as behavior-preserving refactor work. Worker job
  status transitions, callback payloads, validation/self-correction behavior,
  generated file application, Git commit/push behavior, artifact paths, final
  reports, eval scores, and research pack contents must remain stable.
- **D-02:** Add or tighten characterization tests before moving behavior. Every
  risky extraction should have a RED or fail-first guard where practical, then
  pass after the refactor.
- **D-03:** Prefer worker-local modules over new packages. Do not add runtime
  dependencies, replace LangGraph/BullMQ/Hono, introduce a browser framework,
  or redesign the execution pipeline.
- **D-04:** Use narrow commits by seam: run orchestration, codegen internals,
  eval harness, and research/data-collector helpers should remain separable in
  history.

### Worker Execution Hub

- **D-05:** Split `apps/worker-code/src/executor/runJob.ts` around existing
  responsibilities: job dispatch, research/artifact collection, media
  generation, codegen invocation, validation, self-correction, commit/push, and
  result/report callback.
- **D-06:** Keep `apps/worker-code/src/routes/jobs.ts` and orchestrator queue
  contracts stable. `/jobs` and `/jobs/sync` request/response behavior, run
  result shape, logs, and failure handling must not change.
- **D-07:** Preserve worktree, sandbox, validation, callback, and generated
  artifact behavior. If an extraction reveals an execution contract that is too
  broad, record a gap instead of rewriting the runner.

### Codegen Hub

- **D-08:** Split `apps/worker-code/src/executor/codegen.ts` around prompt
  construction, model response parsing, JSON extraction/repair, file selection,
  file apply/write logic, fix candidate selection, and agent instruction
  assembly.
- **D-09:** Preserve generated output semantics: accepted files, rejected paths,
  JSON repair behavior, command policy checks, validation fixes, and self-
  correction inputs must remain test-equivalent.
- **D-10:** Keep model/provider abstractions and role aliases owned by existing
  source files. Do not change model alias defaults or LLM routing in this phase.

### Eval Harness

- **D-11:** Split eval code around scenario loading, scoring, report rendering,
  runtime/CLI orchestration, and role quality checks without changing report
  shape or score thresholds.
- **D-12:** `rtk corepack pnpm verify` must remain green, including eval 14/14
  and regression eval 14/14 with no score regression.
- **D-13:** Preserve deterministic eval behavior. If snapshot/report text is
  updated only because modules moved, tests must prove semantic equivalence.

### Research And Data Collector

- **D-14:** Share policy, sanitization, URL/handle extraction, limitation
  formatting, command tracking, and output assembly helpers across Firecrawl,
  Playwright, Instagram Graph, and Apify paths where safe.
- **D-15:** Preserve data-collector public/authorized research boundaries:
  do not add login bypass, anti-blocking behavior, private scraping, new secret
  requirements, or provider calls not already represented by current code and
  runbooks.
- **D-16:** Preserve research pack section names and limitation wording where
  tests or docs treat them as operational contract.

### Scope Fences

- **D-17:** Do not modify orchestrator route behavior, Plane/Linear provider
  defaults, webhook semantics, database schema, dashboard SQL, live deploy
  config, Tailscale Funnel, or Plane labels in Phase 6.
- **D-18:** Do not remove `coder-agent` compatibility aliases, workflow labels,
  agent keys, skill registry entries, or model aliases without a dedicated
  external-reference audit.
- **D-19:** If a refactor requires changing product behavior or external
  provider behavior, stop and record the exact gap for Phase 7 or a follow-up
  milestone instead of expanding scope silently.

### the agent's Discretion

The planner may choose exact module names and plan granularity, but should keep
the roadmap's three-slice shape unless research proves a dependency requires a
different wave order. The implementation path should optimize for reversible,
test-first seams over maximal file movement.

### Deferred Ideas (OUT OF SCOPE)

- Behavior changes to data collection providers, scraping policy, browser
  strategy, private/authorized Instagram access, or generated landing product
  behavior are out of scope.
- Replacing the eval framework, LLM routing, LangGraph/BullMQ/Hono, or monorepo
  structure is out of scope.
- Final milestone audit, remaining debt decisions, and destructive cleanup
  confirmations belong to Phase 7 or lifecycle gates.
</user_constraints>

<phase_requirements>
## Phase Requirements [VERIFIED: .planning/REQUIREMENTS.md]

| ID | Description | Research Support |
|----|-------------|------------------|
| REF-03 | Worker `runJob` responsibilities are separated into dispatch, research, media, codegen, validation/self-correction, commit/push, and reporting seams. | Split around existing `runJob.ts` responsibility clusters at lines 181-490; add missing orchestration characterization before moving stateful behavior. [VERIFIED: apps/worker-code/src/executor/runJob.ts:181] |
| REF-04 | `codegen.ts` is split into prompt/JSON repair, file selection, apply, fix candidate selection, and agent-instruction concerns. | Existing helper families and tests map directly to prompt, JSON, file selection, write/apply, docs filtering, review filtering, and fix candidate seams. [VERIFIED: apps/worker-code/src/executor/codegen.ts:141] [VERIFIED: apps/worker-code/src/executor/codegen.test.ts:40] |
| REF-05 | Eval harness files are split into scenario loading, scoring, reporting, and CLI orchestration. | `scoring.ts`, `types.ts`, `runtime.ts`, `workerDryRun.ts`, and `roleQuality.ts` already exist; `runEval.ts` remains the hub for loading, reporting, trend, harness checks, and CLI. [VERIFIED: apps/worker-code/src/eval/runEval.ts:41] |
| REF-06 | Data collection research modules share policy/sanitization/output helpers instead of duplicating provider-specific plumbing. | Shared policy already exists in `scrapingPolicy.ts`; duplication remains in truncation, profile URL formatting, redaction usage, command/limitation assembly, and research pack output formatting. [VERIFIED: apps/worker-code/src/executor/scrapingPolicy.ts:69] |
| VER-01 | Characterization tests protect behavior before each risky refactor. | Existing focused suite passed locally: 11 files / 106 tests; missing gaps are stateful `runJob` orchestration seams and new module import guards. [VERIFIED: rtk corepack pnpm vitest run focused worker/eval suite, 2026-07-02] |
</phase_requirements>

## Summary

Phase 6 should be planned as three behavior-preserving refactor waves, matching the roadmap: `runJob.ts`, `codegen.ts`, then eval plus data-collector helpers. [VERIFIED: .planning/ROADMAP.md:162] The current worker route boundary is small and stable, and `/jobs` plus `/jobs/sync` should continue importing only `runJob` and `reportResult`. [VERIFIED: apps/worker-code/src/routes/jobs.ts:1]

The riskiest area is not helper movement; it is preserving the stateful runner loop in `runJob.ts`: data-collector dispatch, worktree setup/cleanup, optional Higgsfield media restore, codegen, landing-aware validation, self-correction, commit failure recovery, push, sandbox summary, and final callback behavior. [VERIFIED: apps/worker-code/src/executor/runJob.ts:181] Existing `runJob.test.ts` covers pure helpers and media helpers, but not the full orchestration branches with mocked worktree/codegen/git/provider seams. [VERIFIED: apps/worker-code/src/executor/runJob.test.ts:22]

`codegen.ts` has the best existing characterization base: JSON extraction/repair, `completeJson`, agent instructions, docs filtering, review-create filtering, allowed-file filtering, and fix candidate selection are all covered. [VERIFIED: apps/worker-code/src/executor/codegen.test.ts:40] Eval/report semantics also have focused coverage, but `runEval.ts` needs careful splitting because report rendering, trend comparison, fixture normalization, and harness checks are currently coupled. [VERIFIED: apps/worker-code/src/eval/runEval.ts:84]

**Primary recommendation:** Plan 06-01 as fail-first stateful runner seam tests plus thin coordinator extraction; plan 06-02 as pure codegen helper moves with compatibility re-exports; plan 06-03 as eval loader/report/check split and conservative research-output helper extraction. [VERIFIED: .planning/phases/06-worker-and-eval-hub-refactor/06-CONTEXT.md:230]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Worker HTTP intake `/jobs` and `/jobs/sync` | API / Backend | Orchestrator queue | Hono route receives orchestrator dispatch, validates `jobSchema`, and delegates execution/reporting. [VERIFIED: apps/worker-code/src/routes/jobs.ts:11] |
| Worker execution orchestration | API / Backend | Database / artifact store via callback | `runJob` owns worktree, validation, codegen, commit/push, sandbox summary, and result shape before callback. [VERIFIED: apps/worker-code/src/executor/runJob.ts:181] |
| Codegen prompt/parse/apply/fix behavior | API / Backend | External LLM gateway | `generateAndApplyCode` and `applyFix` call the LLM client and write files inside the worker worktree. [VERIFIED: apps/worker-code/src/executor/codegen.ts:483] |
| Research/data-collector providers | API / Backend | External providers | Firecrawl, Playwright, Instagram Graph, and Apify are worker-side provider integrations guarded by scraping policy and secret redaction. [VERIFIED: apps/worker-code/src/executor/firecrawlResearch.ts:100] |
| Eval harness | Local validation CLI | Worker dry-run helpers | `runEval.ts` loads fixtures, creates temp repos, runs dry-run or candidate commands, scores, renders reports, and writes `.eval-runs` artifacts. [VERIFIED: apps/worker-code/src/eval/runEval.ts:41] |
| Stored research/eval artifacts | Database / Storage | API / Backend | Orchestrator stores run artifacts including `research`, while eval writes report JSON/Markdown and latest baseline files. [VERIFIED: apps/orchestrator-api/src/db/schema.ts:179] [CITED: docs/runbooks/eval-harness.md] |

## Project Constraints (from AGENTS.md)

- `AGENTS.md` is a pointer to `CLAUDE.md`; project rules live in `CLAUDE.md`. [VERIFIED: AGENTS.md:1]
- Branch names and commit messages should follow Conventional Commits. [VERIFIED: CLAUDE.md:5]
- The primary work provider is Plane workspace `attodev`, project `Agent Platform` (`AGP`); Linear is optional/legacy. [VERIFIED: CLAUDE.md:20]
- Prefix project commands with `rtk`; RTK passes through commands it does not filter. [VERIFIED: CLAUDE.md:31]
- Preserve unrelated dirty/untracked paths; current unrelated untracked planning/docs paths already exist and must not be swept into Phase 6 edits. [VERIFIED: rtk git status --short, 2026-07-02]
- No project-defined `.codex/skills` or `.agents/skills` directories were found, so no local skill rules need to be loaded for planning. [VERIFIED: find .codex/skills .agents/skills -maxdepth 2 -name SKILL.md, 2026-07-02]

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| Node.js | 22.22.3 local | Runtime for workspace scripts, worker code, and GSD tooling. | Root `package.json` requires Node `>=22`; local runtime satisfies it. [VERIFIED: package.json:6] [VERIFIED: node --version] |
| pnpm via Corepack | pnpm 11.5.2 local | Workspace package manager and script runner. | Root `packageManager` pins `pnpm@11.5.2`; local Corepack/pnpm matches. [VERIFIED: package.json:8] [VERIFIED: corepack pnpm --version] |
| TypeScript | 5.9.3 local, npm latest 6.0.3 modified 2026-06-18 | Static typecheck/build for worker and monorepo. | Existing scripts use `tsc` and `tsc --noEmit`; no version change should be planned. [VERIFIED: apps/worker-code/package.json:10] [VERIFIED: npm view typescript] |
| Vitest | 3.2.6 local, npm latest 4.1.9 modified 2026-06-15 | Focused characterization and regression tests. | Existing root `test` script is `vitest run`; focused Phase 6 suite passed locally. [VERIFIED: package.json:19] [CITED: https://vitest.dev/guide/cli] |
| Zod | 3.24.2 manifest, npm latest 4.4.3 modified 2026-05-04 | Runtime schemas for codegen responses, eval scenarios, env, and job input. | Existing code already uses Zod schemas; do not replace schema validation during refactor. [VERIFIED: apps/worker-code/package.json:18] |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| Hono | 4.7.2 manifest, npm latest 4.12.27 modified 2026-06-23 | Worker HTTP routes. | Keep route behavior stable; no Hono refactor belongs in Phase 6. [VERIFIED: apps/worker-code/package.json:17] |
| Playwright | 1.61.0 local, npm latest 1.61.1 modified 2026-07-02 | Optional controlled dynamic research path. | Use existing tests only; do not expand provider behavior or add browser flows. [VERIFIED: apps/worker-code/package.json:19] [VERIFIED: playwright --version] |
| tsx | 4.22.4 local, npm latest 4.22.5 modified 2026-07-02 | Runs eval CLI from TypeScript source. | Existing `eval` script uses `tsx src/eval/runEval.ts`. [VERIFIED: apps/worker-code/package.json:8] |
| Git | 2.39.5 local | Eval temp repos and worker commits/pushes. | Existing eval/runtime and worker helpers shell out to Git; refactor should keep helper ownership. [VERIFIED: git --version] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing worker-local modules | New shared package | Rejected by Phase 6 decision D-03; package extraction would add API/versioning risk without needing new runtime behavior. [VERIFIED: .planning/phases/06-worker-and-eval-hub-refactor/06-CONTEXT.md:32] |
| Existing Vitest characterization tests | New test framework | Rejected because Vitest is already configured and passes focused worker/eval tests. [VERIFIED: vitest.config.ts:1] |
| Existing Zod schemas | Hand-written validation | Rejected because current schemas already parse eval fixtures, codegen responses, and env values. [VERIFIED: apps/worker-code/src/eval/types.ts:363] |

**Installation:**

```bash
# No package install. Phase 6 should keep package.json and pnpm-lock.yaml unchanged.
```

**Version verification:** Local versions were checked with `node --version`, `corepack pnpm --version`, `corepack pnpm exec vitest --version`, `corepack pnpm exec tsc --version`, `corepack pnpm --filter @agent-platform/worker-code exec playwright --version`, and npm metadata lookups on 2026-07-02. [VERIFIED: local commands]

## Package Legitimacy Audit

Phase 6 should install no external packages; the package legitimacy gate is not required for a no-install refactor. [VERIFIED: .planning/phases/06-worker-and-eval-hub-refactor/06-CONTEXT.md:32]

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| none | npm | n/a | n/a | n/a | n/a | No package additions planned. [VERIFIED: .planning/phases/06-worker-and-eval-hub-refactor/06-CONTEXT.md:32] |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```text
Orchestrator queue / worker HTTP dispatch
  -> apps/worker-code/src/routes/jobs.ts
     -> runJob(job)
        -> decision: data-collector-agent?
           -> yes: shouldUsePlaywrightResearch(job)?
              -> yes: Playwright research -> research JobResult
              -> no: Firecrawl + Instagram Graph + Apify research -> research JobResult
           -> no: prepare worktree
              -> optional Higgsfield media generation/restoration
              -> generateAndApplyCode
              -> landing quality + validation commands
              -> applyFix loop for validation failures
              -> git commit failure fix loop
              -> diff + push
              -> JobResult callback payload
        -> cleanup worktree

Eval CLI
  -> parse args
  -> load scenario fixtures
  -> run scenario in temp Git repo
     -> candidate apply OR workerDryRun
     -> scoreScenario + harness checks
  -> report.json/report.md/latest-report/history.jsonl
  -> optional regression failure exit code
```

### Recommended Project Structure

```text
apps/worker-code/src/executor/
├── runJob.ts                  # public runJob/reportResult coordinator and compatibility exports
├── jobDispatch.ts             # data-collector vs codegen branch selection
├── jobValidation.ts           # runGuarded/runValidation/landing-aware validation seam
├── jobSelfCorrection.ts       # applyFix loop and commit-failure recovery seam
├── jobMedia.ts                # landing media prompt/path/restore helpers
├── jobResult.ts               # sandbox summary, commit error, result helpers
├── codegen.ts                 # public generateAndApplyCode/applyFix facade
├── codegenPrompts.ts          # SELECT/GENERATE/FIX prompts and instruction assembly
├── codegenJson.ts             # extractJson/completeJson/repair
├── codegenFiles.ts            # safeJoin/list/read/apply/filter files
├── codegenSelection.ts        # docs/review target filtering and selection shaping
├── codegenFixes.ts            # fix candidate selection and text/binary exclusions
├── researchOutput.ts          # truncate/bullets/section/limitation/sanitization helpers
└── researchInstagram.ts       # shared handle/profile URL helpers if kept narrow

apps/worker-code/src/eval/
├── runEval.ts                 # CLI and runEvalSuite facade
├── scenarioLoader.ts          # loadScenarios + normalizeScenarioFixture
├── scenarioRunner.ts          # runScenario temp-repo orchestration
├── reportRenderer.ts          # renderMarkdown + result insight helpers
├── trend.ts                   # compareReports/reportSummary
└── harnessChecks.ts           # createHarnessChecks/extract expectation/actual/combine score
```

### Pattern 1: Compatibility Facade During Moves

**What:** Move pure helpers into focused files, but keep old public exports from `runJob.ts`, `codegen.ts`, and `runEval.ts` until all tests/imports are updated. [VERIFIED: existing tests import helpers from hub files]

**When to use:** Use for helpers already imported by tests or other modules: `summarizeFailureTail`, `buildCommitMessage`, `commitErrorResult`, `extractJson`, `completeJson`, `filterAllowedFiles`, `normalizeScenarioFixture`, `compareReports`, and `renderMarkdown`. [VERIFIED: apps/worker-code/src/executor/codegen.test.ts:7] [VERIFIED: apps/worker-code/src/eval/runEval.test.ts:2]

**Example:**

```typescript
// Source: local pattern recommendation based on existing public test imports.
export { completeJson, extractJson } from './codegenJson.js';
export { generateAndApplyCode, applyFix } from './codegenOrchestrator.js';
```

### Pattern 2: Stateful Runner Seam Tests Before Extraction

**What:** Add fail-first tests that import proposed seam modules and exercise data-collector dispatch, validation failure, commit failure recovery, revise no-op, and callback shape through fakes. [VERIFIED: existing runJob helper tests do not cover these orchestration branches]

**When to use:** Use before moving any code between `runJob.ts`, `jobValidation.ts`, `jobSelfCorrection.ts`, or `jobResult.ts`. [VERIFIED: apps/worker-code/src/executor/runJob.ts:298]

**Example:**

```typescript
// Source: local Vitest pattern; vi.fn is documented by Vitest official docs.
import { describe, expect, it, vi } from 'vitest';

it('preserves failed validation JobResult shape', async () => {
  const runGuarded = vi.fn(async () => ({
    command: 'pnpm test',
    exitCode: 1,
    stdout: '',
    stderr: 'FAIL',
    durationMs: 1,
  }));
  // Call extracted validation helper with fake command runner and assert
  // testsPassed=false, sandbox.failedCommand, and failureTail semantics.
});
```

### Pattern 3: Eval Split Keeps Scoring and Report Shape Immutable

**What:** Move `loadScenarios`, `runScenario`, `renderMarkdown`, `compareReports`, and harness-check helpers to focused modules, but keep `runEvalSuite` as the only suite-level coordinator. [VERIFIED: apps/worker-code/src/eval/runEval.ts:41]

**When to use:** Use after adding import-guard tests for new eval modules and before changing CLI or output file writes. [VERIFIED: apps/worker-code/src/eval/runEval.test.ts:176]

**Example:**

```typescript
// Source: local eval split recommendation.
const scenarios = await loadScenarios(fixturesDir);
const results = await Promise.all(
  scenarios.map((scenario) => runScenario(scenario, artifactDirFor(scenario))),
);
return writeEvalReport({ results, outRoot, generatedAt });
```

### Pattern 4: Research Helpers Stay Text/Policy-Oriented

**What:** Share `truncate`, bullet/section builders, handle/profile URL parsing, exact-secret redaction, and limitation formatting; do not collapse Firecrawl, Playwright, Graph, and Apify into one generic provider runner. [VERIFIED: provider modules have different command/result contracts]

**When to use:** Use only for pure formatting/sanitization helpers already duplicated across provider modules. [VERIFIED: apps/worker-code/src/executor/firecrawlResearch.ts:615] [VERIFIED: apps/worker-code/src/executor/playwrightResearch.ts:313]

**Example:**

```typescript
// Source: local helper extraction target.
export function truncateText(value: string, maxChars: number): string {
  const clean = value.trim();
  return clean.length <= maxChars ? clean : `${clean.slice(0, maxChars - 20).trim()}\n\n[truncated]`;
}
```

### Anti-Patterns to Avoid

- **Moving routes first:** `jobs.ts` is already thin and route behavior is a Phase 6 scope fence; do not extract route auth or response semantics here. [VERIFIED: apps/worker-code/src/routes/jobs.ts:11]
- **Generic provider abstraction:** Firecrawl, Playwright, Instagram Graph, and Apify have intentionally different permissions, commands, and output sections; share text helpers, not provider control flow. [VERIFIED: docs/runbooks/data-collector-agent.md:64]
- **Eval report rewrite:** `report.json`, `report.md`, `latest-report.json`, and `history.jsonl` are documented artifacts; moving renderer code must not change report shape or score thresholds. [CITED: docs/runbooks/eval-harness.md]
- **Changing model aliases:** `completeJson` hard-codes alias `strong_coder`; Phase 6 D-10 says model/provider abstractions stay owned elsewhere. [VERIFIED: apps/worker-code/src/executor/codegen.ts:194]
- **Dropping `.js` import specifiers:** The repo uses TypeScript ESM with Bundler resolution and emitted JS paths; moved modules should keep explicit `.js` import specifiers. [VERIFIED: tsconfig.base.json:5] [CITED: https://www.typescriptlang.org/tsconfig/moduleResolution.html]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Command safety | New shell parsing or inline allowlist checks | Existing `checkCommand` + `runSandboxedCommand` | Current runner and eval command paths already enforce allowlists and return audited `CommandResult`s. [VERIFIED: apps/worker-code/src/executor/runJob.ts:39] |
| Worktree/Git operations | Ad hoc `git` shell strings in `runJob.ts` | `prepareWorktree`, `cleanupWorktree`, `commitAll`, `diffAgainst`, `pushBranch` | Existing helpers own checkout, cleanup, commit, diff, and push semantics. [VERIFIED: apps/worker-code/src/executor/runJob.ts:11] |
| LLM JSON validation | Regex-only JSON repair or untyped object parsing | `extractJson`, `completeJson`, Zod schemas | Current code has repair behavior, usage tracking, and schema parsing already covered by tests. [VERIFIED: apps/worker-code/src/executor/codegen.ts:180] |
| File path safety | Manual `path.join` writes from model output | Existing `safeJoin`, `filterAllowedFiles`, `applyFiles` seam | Current code blocks path traversal and rejects files outside selected chunks. [VERIFIED: apps/worker-code/src/executor/codegen.ts:248] |
| Scraping safety | New provider-local URL blockers | `buildScrapingPolicy` | Shared policy blocks internal hosts, metadata endpoints, URL credentials, bypass instructions, and broad crawling. [VERIFIED: apps/worker-code/src/executor/scrapingPolicy.ts:69] |
| Eval scoring | Custom score formulas in `runEval.ts` | `scoreScenario` + existing harness checks | Scoring is already isolated; Phase 6 should not change thresholds. [VERIFIED: apps/worker-code/src/eval/scoring.ts:28] |

**Key insight:** The existing project already has the risky semantics encoded in focused helpers and tests; Phase 6 should reduce hub size by moving ownership, not by redesigning behavior. [VERIFIED: apps/worker-code/src/executor/codegen.test.ts:114]

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Orchestrator artifact kinds include `validation`, `summary`, and `research`; eval stores `.eval-runs/latest-report.json` and `history.jsonl` baselines. [VERIFIED: apps/orchestrator-api/src/db/schema.ts:179] [CITED: docs/runbooks/eval-harness.md] | Code edit only; do not rename artifact kinds, report fields, or eval baseline files. Run eval regression after refactor. |
| Live service config | Worker/orchestrator auth, Plane provider defaults, webhooks, Tailscale Funnel, and labels are Phase 6 scope fences. [VERIFIED: .planning/phases/06-worker-and-eval-hub-refactor/06-CONTEXT.md:88] | No live config migration. Planner should exclude deploy/env/provider route changes. |
| OS-registered state | None found for this phase; no service names, task registrations, or process manager names are being renamed. [VERIFIED: Phase 6 scope is module split only] | No OS re-registration task. |
| Secrets/env vars | Runner env includes `RUNNER_AUTH_TOKEN`, LLM, Firecrawl, Playwright, Instagram Graph, Apify, sandbox, allowlist, and artifact-dir variables. [VERIFIED: apps/worker-code/src/env.ts:14] | No secret rename. Preserve env key names and redaction; do not introduce new secret requirements. |
| Build artifacts | `apps/worker-code/dist`, package `dist/` folders, `.eval-runs`, and root `.worktrees` exist locally. [VERIFIED: find dist/.eval-runs/.worktrees, 2026-07-02] | Run build/typecheck/eval after moves. Do not commit generated `dist`, `.eval-runs`, or `.worktrees` churn unless explicitly intended. |

**Nothing found in category:** OS-registered state is none for this source-only refactor, verified by the absence of any planned service/registration rename in Phase 6 scope. [VERIFIED: .planning/phases/06-worker-and-eval-hub-refactor/06-CONTEXT.md:10]

## Common Pitfalls

### Pitfall 1: Refactoring `runJob` Without Runner-Branch Characterization

**What goes wrong:** Data-collector jobs, revise no-op jobs, failed validation, commit-hook failure recovery, or Higgsfield asset restoration drift while helper tests still pass. [VERIFIED: apps/worker-code/src/executor/runJob.ts:238]
**Why it happens:** Current `runJob.test.ts` focuses on exported pure helpers, not full branch orchestration. [VERIFIED: apps/worker-code/src/executor/runJob.test.ts:22]
**How to avoid:** Add fail-first seam tests with faked provider/codegen/worktree/git/validation boundaries before extracting stateful loops. [VERIFIED: .planning/phases/06-worker-and-eval-hub-refactor/06-CONTEXT.md:28]
**Warning signs:** Tests still pass after changing `runJob.ts`, but no test asserts `JobResult` shape for failed validation, commit failure, no-op revise, or data-collector success.

### Pitfall 2: Changing Research Pack Section Names

**What goes wrong:** Research-to-landing continuation loses the `## Landing Page Brief` priority section or provider sections expected by docs/tests. [VERIFIED: docs/runbooks/data-collector-agent.md:86]
**Why it happens:** Formatting helpers look safe to dedupe, but section names and limitation text are operational contract. [VERIFIED: apps/worker-code/src/executor/firecrawlResearch.test.ts:251]
**How to avoid:** Snapshot key headings in provider tests before extracting `researchOutput.ts`. [VERIFIED: apps/worker-code/src/executor/firecrawlResearch.test.ts:43]
**Warning signs:** Tests assert only `status: succeeded` and stop checking headings, limitations, or token redaction.

### Pitfall 3: Eval Renderer Drift

**What goes wrong:** `report.md` insight lines change, `latest-report.json` shape changes, or regression delta logic changes while moving renderer functions. [VERIFIED: apps/worker-code/src/eval/runEval.ts:212]
**Why it happens:** `renderMarkdown`, `extractResultInsights`, and harness-check inference are all in the same file and easy to move with small text changes. [VERIFIED: apps/worker-code/src/eval/runEval.ts:559]
**How to avoid:** Move renderer helpers unchanged first, keep `runEval.test.ts` green, then run `eval` and `eval:regression`. [VERIFIED: apps/worker-code/src/eval/runEval.test.ts:176]
**Warning signs:** Diff contains wording changes in report output not required by import rewiring.

### Pitfall 4: ESM Import Rewire Errors

**What goes wrong:** Typecheck/build fails after moving modules because imports omit `.js`, type-only imports are not marked as `type`, or circular imports appear. [VERIFIED: tsconfig.base.json:9]
**Why it happens:** The repo uses ESM module syntax and `verbatimModuleSyntax`. [VERIFIED: tsconfig.base.json:8]
**How to avoid:** Preserve `.js` specifiers, use `import type`, and run `rtk corepack pnpm --filter @agent-platform/worker-code typecheck` after each wave. [CITED: https://www.typescriptlang.org/tsconfig/noEmit.html]
**Warning signs:** `TS1484`, missing module, or runtime import errors after build.

## Code Examples

Verified patterns from official and local sources:

### Focused Vitest Characterization

```typescript
// Source: Vitest official docs for vi.fn/vi.mock and local test style.
import { describe, expect, it, vi } from 'vitest';

describe('jobValidation', () => {
  it('stops on first failed validation command', async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce({ command: 'pnpm build', exitCode: 1, stdout: '', stderr: 'boom', durationMs: 1 });

    const result = await runValidationWithRunner(['pnpm build', 'pnpm test'], runCommand);

    expect(result.passed).toBe(false);
    expect(runCommand).toHaveBeenCalledTimes(1);
  });
});
```

### Compatibility Re-Export After Moving Codegen JSON Helpers

```typescript
// Source: local compatibility pattern for existing codegen.test.ts imports.
export { completeJson, extractJson } from './codegenJson.js';
export { filterAllowedFiles } from './codegenFiles.js';
export { buildFixCandidateFiles, selectFixCandidateFiles } from './codegenFixes.js';
```

### Eval Renderer Split Without Shape Changes

```typescript
// Source: local runEval.ts ownership split recommendation.
import { renderMarkdown } from './reportRenderer.js';
import { compareReports } from './trend.js';

const report = buildEvalReport({ generatedAt, results, previous });
await writeFile(join(artifactRoot, 'report.md'), renderMarkdown(report));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Worker execution, media, validation, self-correction, commit, and callback in one `runJob.ts` hub. | Keep `runJob.ts` as facade/coordinator and extract worker-local seams by responsibility. | Phase 6 planned. [VERIFIED: .planning/ROADMAP.md:153] | Reduces hub size while preserving route and callback contracts. |
| Prompt, JSON repair, file selection, file apply, and fix selection in one `codegen.ts` hub. | Move pure helper families first and keep public facade exports. | Phase 6 planned. [VERIFIED: .planning/ROADMAP.md:154] | Lowest-risk split because tests already cover helpers. |
| Eval CLI, loader, runner, renderer, trends, and harness checks in `runEval.ts`. | Extract loader/runner/renderer/trend/harness modules while leaving CLI facade stable. | Phase 6 planned. [VERIFIED: .planning/ROADMAP.md:155] | Enables smaller eval ownership without changing reports. |
| Provider modules each own their local formatting helpers. | Share narrow output/sanitization helpers only where wording remains stable. | Phase 6 planned. [VERIFIED: .planning/ROADMAP.md:156] | Avoids broad provider abstraction that could alter collection behavior. |

**Deprecated/outdated:**
- New dependency/package extraction for this refactor is out of scope. [VERIFIED: .planning/phases/06-worker-and-eval-hub-refactor/06-CONTEXT.md:32]
- Linear provider behavior changes are out of scope for Phase 6. [VERIFIED: docs/CURRENT.md:6]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| none | All planning-critical claims are tied to local source/docs, local command output, npm metadata, or official docs cited in Sources. | n/a | n/a |

**If this table is empty:** All claims in this research were verified or cited; no user confirmation is needed before planning.

## Open Questions (RESOLVED)

1. **RESOLVED: Should compatibility re-exports be removed after Phase 6?**
   - What we know: Current tests import helpers directly from hub files. [VERIFIED: apps/worker-code/src/executor/codegen.test.ts:7]
   - What's unclear: Whether maintainers want a cleanup pass to remove old public helper export paths after downstream imports are updated.
   - Resolution: Keep compatibility re-exports in Phase 6. Removing old public helper export paths is deferred to a future explicit cleanup, not this behavior-preserving phase.

2. **RESOLVED: How much runner orchestration should move in 06-01?**
   - What we know: `runJob.ts` has intertwined state around media restore, validation, self-correction, and commit recovery. [VERIFIED: apps/worker-code/src/executor/runJob.ts:298]
   - What's unclear: Whether extracting `applySelfCorrection` and commit retry into a separate module will require dependency injection changes.
   - Resolution: Extract validation/media/result helpers first. Extract self-correction only after faked orchestration tests are green; if extraction requires product behavior changes, stop and record a gap.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | all workspace scripts | yes | 22.22.3 | none needed |
| Corepack | pnpm command execution | yes | 0.34.6 | none needed |
| pnpm | tests/build/eval | yes | 11.5.2 | none needed |
| Git | worker commit helpers and eval temp repos | yes | 2.39.5 | none needed |
| Vitest | characterization tests | yes | 3.2.6 | none needed |
| TypeScript | build/typecheck | yes | 5.9.3 local | none needed |
| tsx | eval CLI | yes | 4.22.4 | none needed |
| Playwright | optional dynamic research tests/path | yes | 1.61.0 | Use adapter-based tests if browser runtime is unavailable |
| Context7 CLI | external doc lookup fallback | no | n/a | Official web docs were used for light Vitest/TypeScript citations |

**Missing dependencies with no fallback:**
- None for Phase 6 planning/execution. [VERIFIED: environment probes, 2026-07-02]

**Missing dependencies with fallback:**
- Context7 CLI is missing; official Vitest and TypeScript docs were checked through web search instead. [VERIFIED: ctx7-not-found]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.6 local [VERIFIED: vitest --version] |
| Config file | `vitest.config.ts` with `include: ['**/*.test.ts']`, `passWithNoTests`, and `vitest.setup.ts`. [VERIFIED: vitest.config.ts:3] |
| Quick run command | `rtk corepack pnpm vitest run apps/worker-code/src/executor/runJob.test.ts apps/worker-code/src/executor/codegen.test.ts apps/worker-code/src/eval/runEval.test.ts` |
| Full suite command | `rtk corepack pnpm verify` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| REF-03 | Runner dispatch, validation/self-correction, commit/push/report seams remain stable. | unit + characterization | `rtk corepack pnpm vitest run apps/worker-code/src/executor/runJob.test.ts` plus new runner seam tests | Existing partial; Wave 0 gap |
| REF-04 | Codegen prompt/JSON/file/fix helpers remain test-equivalent. | unit | `rtk corepack pnpm vitest run apps/worker-code/src/executor/codegen.test.ts apps/worker-code/src/eval/workerDryRun.test.ts` | yes |
| REF-05 | Eval scenario loading, scoring, report rendering, CLI orchestration remain stable. | unit + regression eval | `rtk corepack pnpm vitest run apps/worker-code/src/eval/runEval.test.ts apps/worker-code/src/eval/scoring.test.ts apps/worker-code/src/eval/workerDryRun.test.ts apps/worker-code/src/eval/roleQuality.test.ts` | yes |
| REF-06 | Research providers share helpers without changing policy, redaction, section names, or limitations. | unit | `rtk corepack pnpm vitest run apps/worker-code/src/executor/firecrawlResearch.test.ts apps/worker-code/src/executor/playwrightResearch.test.ts apps/worker-code/src/executor/scrapingPolicy.test.ts apps/worker-code/src/executor/instagramGraphResearch.test.ts apps/worker-code/src/executor/apifyInstagramResearch.test.ts` | yes |
| VER-01 | Characterization tests guard each risky move before implementation. | process gate | Focused suite above before/after each wave; `rtk corepack pnpm verify` at phase gate | Existing partial; Wave 0 gaps below |

### Sampling Rate

- **Per task commit:** run the focused files touched by that task, with `rtk corepack pnpm --filter @agent-platform/worker-code typecheck` when imports move. [VERIFIED: apps/worker-code/package.json:11]
- **Per wave merge:** run all worker/eval focused tests: `rtk corepack pnpm vitest run apps/worker-code/src/executor/runJob.test.ts apps/worker-code/src/executor/codegen.test.ts apps/worker-code/src/executor/firecrawlResearch.test.ts apps/worker-code/src/executor/playwrightResearch.test.ts apps/worker-code/src/executor/scrapingPolicy.test.ts apps/worker-code/src/executor/instagramGraphResearch.test.ts apps/worker-code/src/executor/apifyInstagramResearch.test.ts apps/worker-code/src/eval/runEval.test.ts apps/worker-code/src/eval/scoring.test.ts apps/worker-code/src/eval/workerDryRun.test.ts apps/worker-code/src/eval/roleQuality.test.ts`. [VERIFIED: command passed 11 files / 106 tests]
- **Phase gate:** `rtk corepack pnpm verify`, including eval and regression eval, before `$gsd-verify-work`. [VERIFIED: package.json:20]

### Wave 0 Gaps

- [ ] `apps/worker-code/src/executor/runJob.seams.test.ts` — covers REF-03 data-collector dispatch, codegen success/failure, validation failure, commit failure recovery, revise no-op, cleanup, and callback/result shape.
- [ ] `apps/worker-code/src/executor/jobValidation.test.ts` — covers extracted validation helper if moved out of `runJob.ts`.
- [ ] `apps/worker-code/src/executor/jobSelfCorrection.test.ts` — covers touched-file accumulation, binary generated asset exclusion/restoration, and max-fix-attempt behavior if self-correction moves.
- [ ] `apps/worker-code/src/eval/scenarioLoader.test.ts` — guards `loadScenarios`/`normalizeScenarioFixture` once moved out of `runEval.ts`.
- [ ] `apps/worker-code/src/eval/reportRenderer.test.ts` — can rehost `renderMarkdown` tests when moved, preserving current expected text.
- [ ] `apps/worker-code/src/executor/researchOutput.test.ts` — guards shared truncation/limitation/redaction helpers before provider modules adopt them.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | Preserve bearer auth between orchestrator and worker; do not modify `/jobs` auth behavior. [VERIFIED: apps/worker-code/src/routes/jobs.ts:11] |
| V3 Session Management | no | Worker HTTP API uses bearer token, not browser sessions. [VERIFIED: apps/worker-code/src/routes/jobs.ts:11] |
| V4 Access Control | yes | Preserve worker job schema validation and command allowlist boundaries. [VERIFIED: apps/worker-code/src/routes/jobs.ts:35] [VERIFIED: apps/worker-code/src/executor/runJob.ts:39] |
| V5 Input Validation | yes | Use existing Zod schemas and scraping policy; do not replace with ad hoc parsing. [VERIFIED: apps/worker-code/src/eval/types.ts:363] [VERIFIED: apps/worker-code/src/executor/scrapingPolicy.ts:69] |
| V6 Cryptography | limited | No new crypto in Phase 6; preserve existing token/secret handling and do not introduce secret storage changes. [VERIFIED: apps/worker-code/src/env.ts:92] |

### Known Threat Patterns for Worker/Eval Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection or unsafe shell execution | Tampering / Elevation of Privilege | Keep `checkCommand` and sandboxed command helpers as the only worker command path. [VERIFIED: apps/worker-code/src/executor/runJob.ts:39] |
| Path traversal from model-generated file paths | Tampering | Keep `safeJoin` and `filterAllowedFiles`; never write unselected model paths. [VERIFIED: apps/worker-code/src/executor/codegen.ts:248] |
| SSRF/internal network scraping | Information Disclosure | Keep `buildScrapingPolicy` for Firecrawl/Playwright URLs and navigation guards. [VERIFIED: apps/worker-code/src/executor/scrapingPolicy.ts:69] |
| Secret leakage in provider errors/artifacts | Information Disclosure | Keep exact-secret and token-pattern redaction; tests assert Firecrawl, Graph, and Apify tokens are not stored. [VERIFIED: apps/worker-code/src/executor/instagramGraphResearch.ts:247] |
| Eval harness reaching live services | Information Disclosure / Spoofing | Keep fixture-local fake repos and fake LLM responses; eval docs prohibit live LLM/GitHub/Plane/Linear calls. [CITED: docs/runbooks/eval-harness.md] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/06-worker-and-eval-hub-refactor/06-CONTEXT.md` - locked Phase 6 decisions, scope fences, and recommended order.
- `.planning/ROADMAP.md` - Phase 6 goal, success criteria, and three planned slices.
- `.planning/REQUIREMENTS.md` - REF-03, REF-04, REF-05, REF-06, VER-01.
- `.planning/phases/04-operational-flow-reorganization/04-VERIFICATION.md` - active flow/source-owner anchors.
- `.planning/phases/05-orchestrator-hub-refactor/05-VERIFICATION.md` - Phase 5 route/helper seams and Phase 6 deferral.
- `docs/CURRENT.md`, `docs/runbooks/landing-page-agent.md`, `docs/runbooks/data-collector-agent.md`, `docs/runbooks/eval-harness.md` - current operational contracts.
- `apps/worker-code/src/routes/jobs.ts`, `apps/worker-code/src/executor/runJob.ts`, `apps/worker-code/src/executor/codegen.ts`, `apps/worker-code/src/executor/firecrawlResearch.ts`, `apps/worker-code/src/eval/runEval.ts`, `apps/worker-code/src/eval/scoring.ts`, `apps/worker-code/src/eval/types.ts` - source inspection.
- Focused local test command passed: 11 worker/eval/research files, 106 tests. [VERIFIED: rtk corepack pnpm vitest run focused worker/eval suite, 2026-07-02]

### Secondary (MEDIUM confidence)

- Vitest official docs: `https://vitest.dev/api/mock.html`, `https://vitest.dev/guide/cli`, `https://vitest.dev/guide/mocking/modules` - `vi.fn`, `vi.mock`, and `vitest run` behavior. [CITED: https://vitest.dev/api/mock.html]
- TypeScript official docs: `https://www.typescriptlang.org/tsconfig/noEmit.html`, `https://www.typescriptlang.org/tsconfig/moduleResolution.html`, `https://www.typescriptlang.org/tsconfig/module.html` - no-emit typechecking and module resolution behavior. [CITED: https://www.typescriptlang.org/tsconfig/noEmit.html]
- npm registry metadata for existing packages only; no packages are recommended for install. [VERIFIED: npm view commands, 2026-07-02]

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - versions verified from local commands, local manifests, and npm metadata; no install recommendation. [VERIFIED: package.json]
- Architecture: HIGH - derived from direct source inspection and prior phase verification reports. [VERIFIED: apps/worker-code/src/executor/runJob.ts]
- Pitfalls: HIGH - derived from uncovered/covered test boundaries and current source coupling. [VERIFIED: apps/worker-code/src/executor/runJob.test.ts]

**Research date:** 2026-07-02
**Valid until:** 2026-08-01 for codebase refactor guidance; re-check npm/docs if tooling versions or package manifests change before planning.
