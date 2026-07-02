---
phase: 07
slug: final-verification-and-governance-closeout
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-02
---

# Phase 07 - Validation Strategy

> Final milestone validation contract for verification, eval regression, and governance closeout.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.6 plus project package scripts |
| **Config file** | `vitest.config.ts`; package scripts in `package.json` |
| **Quick run command** | `rtk corepack pnpm verify:loop` |
| **Full suite command** | `rtk corepack pnpm verify` |
| **Estimated runtime** | ~30 seconds for full verify in the current environment |

---

## Sampling Rate

- **After final verification task:** Run `rtk corepack pnpm verify`.
- **After closeout docs task:** Run static closeout coverage checks with `rtk rg`, plus `rtk git diff --check`.
- **Before `$gsd-verify-work`/phase completion:** Full suite must be green and closeout docs must name VER-02, VER-03, VER-04, removed legacy, accepted gaps, remaining debt, and next cleanup candidates.
- **Max feedback latency:** ~60 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | VER-02, VER-03 | T-07-regression | Final lint/build/test/eval/regression gate proves no cleanup regression. | full suite | `rtk corepack pnpm verify` | Yes | pending |
| 07-01-02 | 01 | 1 | VER-03 | T-07-eval-regression | Latest eval report records 14/14, score 100, score delta 0, and no regressed scenarios. | eval evidence parse | `rtk node -e "const r=require('./.eval-runs/latest-report.json'); if(!(r.passed&&r.total===14&&r.passedCount===14&&r.score===100&&(r.trend?.scoreDelta??0)===0&&(r.trend?.regressed?.length??0)===0)) process.exit(1); console.log(JSON.stringify({generatedAt:r.generatedAt,total:r.total,passedCount:r.passedCount,score:r.score,scoreDelta:r.trend?.scoreDelta,regressed:r.trend?.regressed},null,2));"` | Yes | pending |
| 07-02-01 | 02 | 2 | VER-04 | T-07-doc-gap | Milestone audit and docs record removed legacy, accepted gaps, remaining debt, and next cleanup candidates with source evidence. | static docs audit | `rtk rg -n "VER-02|VER-03|VER-04|removed legacy|accepted gaps|remaining debt|next cleanup|destructive cleanup|Linear" .planning/phases/07-final-verification-and-governance-closeout docs/CURRENT.md docs/README.md docs/HISTORICAL.md` | Partial | pending |
| 07-02-02 | 02 | 2 | VER-04 | T-07-metadata | Planning metadata can advance without relying on chat context. | metadata gate | `rtk node $HOME/.codex/gsd-core/bin/gsd-tools.cjs query phase-plan-index 07 && rtk git diff --check -- .planning/phases/07-final-verification-and-governance-closeout docs/CURRENT.md docs/README.md docs/HISTORICAL.md` | Partial | pending |
| 07-GATE | gate | gate | VER-02, VER-03, VER-04 | T-07-final-state | Final closeout state remains verifiable and self-contained. | full suite + static audit | `rtk corepack pnpm verify && rtk rg -n "VER-02|VER-03|VER-04|accepted gaps|remaining debt|next cleanup" .planning/phases/07-final-verification-and-governance-closeout docs/CURRENT.md docs/README.md docs/HISTORICAL.md` | Partial | pending |

*Status values: pending, green, red, flaky.*

---

## Wave 0 Requirements

Existing project verification infrastructure covers all Phase 07 requirements. No new test framework or Wave 0 test file is required because this phase validates final state and documentation.

---

## Manual-Only Verifications

All phase behaviors have automated or static verification. Human judgment is limited to reviewing the closeout narrative quality after the automated gates pass.

---

## Validation Sign-Off

- [x] All tasks have automated verify or static docs checks.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] No watch-mode flags.
- [x] Feedback latency target is defined.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-07-02
