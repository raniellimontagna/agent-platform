# Phase 07 Final Gate Evidence

**Plan:** 07-01 - final verification and eval regression proof
**Command:** `rtk corepack pnpm verify`
**First required full gate started:** 2026-07-02T19:40:06Z
**Latest isolated full gate started:** 2026-07-02T19:42:55Z
**Exit code:** 0
**Status:** PASS

## Stage Results

| Stage | Result | Evidence |
|---|---:|---|
| lint | PASS | `biome check .` checked 269 files; no fixes applied. |
| build | PASS | `corepack pnpm -r build` completed all workspace package builds. |
| tests | PASS | Vitest reported 94 test files passed and 589 tests passed. |
| eval | PASS | Eval report `.eval-runs/2026-07-02T19-43-14-801Z`; 14/14 scenarios passed; score 100; score delta 0. |
| regression eval | PASS | Regression eval report `.eval-runs/2026-07-02T19-43-18-145Z`; 14/14 scenarios passed; score 100; score delta 0. |

## Eval Report Parse

Parsed `.eval-runs/latest-report.json` after the full gate with the required VER-03 predicate.

| Field | Value |
|---|---:|
| generatedAt | `2026-07-02T19-43-18-145Z` |
| passed | `true` |
| total | `14` |
| passedCount | `14` |
| score | `100` |
| trend.scoreDelta | `0` |
| regressed scenarios | `0` |

**Regression status:** PASS - no score regression and no regressed scenarios.

## Failure Details

None. The full gate exited 0 and the eval parser matched the required VER-03 values.

## Focused Diagnosis

Not needed. Per D-09, focused diagnosis is only required after a final-gate or eval-parse failure.

## Artifact Notes

The full gate refreshed `.eval-runs/latest-report.json`, `.eval-runs/history.jsonl`, and timestamped eval report directories on disk. `.eval-runs/` is intentionally ignored by `.gitignore`, so these generated runtime artifacts are not visible in `rtk git status --short`; the durable closeout evidence is recorded in this file.
