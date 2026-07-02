---
phase: 06
slug: worker-and-eval-hub-refactor
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-02
---

# Phase 06 - Validation Strategy

> Per-phase validation contract for feedback sampling during worker/eval refactor execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.6 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `rtk corepack pnpm vitest run apps/worker-code/src/executor/runJob.test.ts apps/worker-code/src/executor/codegen.test.ts apps/worker-code/src/eval/runEval.test.ts` |
| **Full suite command** | `rtk corepack pnpm verify` |
| **Estimated runtime** | ~180 seconds for full verify |

---

## Sampling Rate

- **After every task commit:** Run the focused Vitest files for the touched worker/eval module, plus `rtk corepack pnpm --filter @agent-platform/worker-code typecheck` when imports move.
- **After every plan wave:** Run all worker/eval focused tests:

  ```bash
  rtk corepack pnpm vitest run apps/worker-code/src/executor/runJob.test.ts apps/worker-code/src/executor/codegen.test.ts apps/worker-code/src/executor/firecrawlResearch.test.ts apps/worker-code/src/executor/playwrightResearch.test.ts apps/worker-code/src/executor/scrapingPolicy.test.ts apps/worker-code/src/executor/instagramGraphResearch.test.ts apps/worker-code/src/executor/apifyInstagramResearch.test.ts apps/worker-code/src/eval/runEval.test.ts apps/worker-code/src/eval/scoring.test.ts apps/worker-code/src/eval/workerDryRun.test.ts apps/worker-code/src/eval/roleQuality.test.ts
  ```

- **Before `$gsd-verify-work`:** `rtk corepack pnpm verify` must be green.
- **Max feedback latency:** ~180 seconds at phase gate; focused worker/eval runs should stay under ~45 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-W0 | 01 | 0 | REF-03, VER-01 | T-06-runner-regression | Runner dispatch, validation, commit recovery, cleanup, and callback/result shape are characterized before extraction. | unit/characterization | `rtk corepack pnpm vitest run apps/worker-code/src/executor/runJob.test.ts apps/worker-code/src/executor/runJob.seams.test.ts` | No - W0 | pending |
| 06-01-01 | 01 | 1 | REF-03 | T-06-runner-regression | `/jobs` route continues to import `runJob` and `reportResult`; `JobResult` payloads remain compatible. | unit + typecheck | `rtk corepack pnpm vitest run apps/worker-code/src/executor/runJob.test.ts apps/worker-code/src/executor/runJob.seams.test.ts && rtk corepack pnpm --filter @agent-platform/worker-code typecheck` | Partial | pending |
| 06-01-02 | 01 | 1 | REF-03 | T-06-command-policy | Command allowlist, validation failure tails, self-correction limits, and cleanup behavior stay unchanged. | unit | `rtk corepack pnpm vitest run apps/worker-code/src/executor/runJob.seams.test.ts apps/worker-code/src/executor/jobValidation.test.ts apps/worker-code/src/executor/jobSelfCorrection.test.ts` | No - W0 | pending |
| 06-02-W0 | 02 | 0 | REF-04, VER-01 | T-06-codegen-regression | Prompt, JSON, file, selection, and fix helpers are characterized before movement. | unit/characterization | `rtk corepack pnpm vitest run apps/worker-code/src/executor/codegen.test.ts apps/worker-code/src/eval/workerDryRun.test.ts` | Yes | pending |
| 06-02-01 | 02 | 1 | REF-04 | T-06-codegen-regression | `codegen.ts` remains a compatibility facade while extracted helpers preserve existing generated-file behavior. | unit + typecheck | `rtk corepack pnpm vitest run apps/worker-code/src/executor/codegen.test.ts apps/worker-code/src/executor/codegenJson.test.ts apps/worker-code/src/executor/codegenFiles.test.ts apps/worker-code/src/executor/codegenSelection.test.ts apps/worker-code/src/executor/codegenFixes.test.ts && rtk corepack pnpm --filter @agent-platform/worker-code typecheck` | Partial | pending |
| 06-03-W0 | 03 | 0 | REF-05, REF-06, VER-01 | T-06-eval-research-regression | Eval report text, scenario loading, trends, harness checks, and research output formatting are characterized before extraction. | unit/characterization | `rtk corepack pnpm vitest run apps/worker-code/src/eval/runEval.test.ts apps/worker-code/src/eval/scoring.test.ts apps/worker-code/src/eval/workerDryRun.test.ts apps/worker-code/src/eval/roleQuality.test.ts apps/worker-code/src/executor/firecrawlResearch.test.ts apps/worker-code/src/executor/playwrightResearch.test.ts apps/worker-code/src/executor/instagramGraphResearch.test.ts apps/worker-code/src/executor/apifyInstagramResearch.test.ts` | Partial | pending |
| 06-03-01 | 03 | 1 | REF-05 | T-06-eval-regression | `runEval.ts` remains a CLI/coordinator facade; scenario loading, rendering, trend, and harness semantics stay stable. | unit + typecheck | `rtk corepack pnpm vitest run apps/worker-code/src/eval/runEval.test.ts apps/worker-code/src/eval/scenarioLoader.test.ts apps/worker-code/src/eval/reportRenderer.test.ts apps/worker-code/src/eval/trend.test.ts apps/worker-code/src/eval/harnessChecks.test.ts && rtk corepack pnpm --filter @agent-platform/worker-code typecheck` | Partial | pending |
| 06-03-02 | 03 | 1 | REF-06 | T-06-research-regression | Shared research helpers preserve provider policy, redaction, section names, limitation wording, and output truncation. | unit + focused provider tests | `rtk corepack pnpm vitest run apps/worker-code/src/executor/researchOutput.test.ts apps/worker-code/src/executor/firecrawlResearch.test.ts apps/worker-code/src/executor/playwrightResearch.test.ts apps/worker-code/src/executor/instagramGraphResearch.test.ts apps/worker-code/src/executor/apifyInstagramResearch.test.ts` | Partial | pending |
| 06-GATE | gate | gate | REF-03, REF-04, REF-05, REF-06, VER-01 | T-06-phase-regression | Full repo verification remains green after all worker/eval extractions. | full suite | `rtk corepack pnpm verify` | Yes | pending |

*Status values: pending, green, red, flaky.*

---

## Wave 0 Requirements

- [ ] `apps/worker-code/src/executor/runJob.seams.test.ts` - covers data-collector dispatch, codegen success/failure, validation failure, commit failure recovery, revise no-op, cleanup, and callback/result shape.
- [ ] `apps/worker-code/src/executor/jobValidation.test.ts` - covers extracted validation helper if moved out of `runJob.ts`.
- [ ] `apps/worker-code/src/executor/jobSelfCorrection.test.ts` - covers touched-file accumulation, generated asset exclusion/restoration, and max-fix-attempt behavior if self-correction moves.
- [ ] `apps/worker-code/src/executor/codegenJson.test.ts` - rehosts JSON extraction/parse characterization when helpers move.
- [ ] `apps/worker-code/src/executor/codegenFiles.test.ts` - rehosts file write, generated marker, and root-boundary characterization when helpers move.
- [ ] `apps/worker-code/src/executor/codegenSelection.test.ts` - rehosts selected-file and dry-run compatibility characterization when helpers move.
- [ ] `apps/worker-code/src/executor/codegenFixes.test.ts` - rehosts fix prompt/result characterization when helpers move.
- [ ] `apps/worker-code/src/eval/scenarioLoader.test.ts` - guards `loadScenarios` and scenario fixture normalization after extraction.
- [ ] `apps/worker-code/src/eval/reportRenderer.test.ts` - guards markdown report text after extraction.
- [ ] `apps/worker-code/src/eval/trend.test.ts` - guards trend summary behavior after extraction.
- [ ] `apps/worker-code/src/eval/harnessChecks.test.ts` - guards harness failure checks after extraction.
- [ ] `apps/worker-code/src/executor/researchOutput.test.ts` - guards shared truncation, limitation, section, and redaction helpers before provider modules adopt them.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency target is defined.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-07-02
