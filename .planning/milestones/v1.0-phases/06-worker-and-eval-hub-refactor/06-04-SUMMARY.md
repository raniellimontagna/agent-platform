---
phase: 06-worker-and-eval-hub-refactor
plan: "04"
subsystem: worker-research
tags: [worker, research, data-collector, tdd, refactor, vitest, biome]
requires:
  - phase: 06-worker-and-eval-hub-refactor
    provides: "06-03 eval facade-preserving helper extraction pattern"
provides:
  - "Shared research output, redaction, truncation, limitation, and Instagram helper modules"
  - "Fail-first Wave 0 characterization tests for research output helper seams"
  - "Provider-safe adoption in Firecrawl, Playwright, Instagram Graph, and Apify research modules"
affects: [phase-06, worker-code, data-collector-agent, research-output]
tech-stack:
  added: []
  patterns:
    - "Worker-local pure helper modules with provider request/control flow left in provider modules"
    - "Fail-first characterization before extraction"
key-files:
  created:
    - apps/worker-code/src/executor/researchOutput.ts
    - apps/worker-code/src/executor/researchInstagram.ts
    - apps/worker-code/src/executor/researchOutput.test.ts
  modified:
    - apps/worker-code/src/executor/firecrawlResearch.ts
    - apps/worker-code/src/executor/playwrightResearch.ts
    - apps/worker-code/src/executor/instagramGraphResearch.ts
    - apps/worker-code/src/executor/apifyInstagramResearch.ts
key-decisions:
  - "Keep provider request execution, policy decisions, secret requirements, and fallback behavior in existing provider modules."
  - "Move only pure research output helpers: headings, truncation, redaction, limitation lines, landing brief assembly, source wording, and Instagram handle/profile helpers."
  - "Preserve package files, schema files, route surfaces, deploy config, provider calls, model aliases, workflow labels, and Plane behavior."
patterns-established:
  - "researchOutput.ts owns shared Markdown/output text helpers and exact-secret/token redaction."
  - "researchInstagram.ts owns Instagram handle extraction, provider handle normalization, and public profile URL formatting."
requirements-completed: [REF-06, VER-01]
coverage:
  - id: D1
    description: "Wave 0 research output characterization tests were committed after a RED run caused by missing proposed helper modules"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/worker-code/src/executor/researchOutput.test.ts (expected RED before extraction: missing ./researchOutput.js)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pure research output and Instagram helpers were extracted and adopted without changing provider behavior"
    requirement: REF-06
    verification:
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/worker-code/src/executor/researchOutput.test.ts apps/worker-code/src/executor/firecrawlResearch.test.ts apps/worker-code/src/executor/playwrightResearch.test.ts apps/worker-code/src/executor/scrapingPolicy.test.ts apps/worker-code/src/executor/instagramGraphResearch.test.ts apps/worker-code/src/executor/apifyInstagramResearch.test.ts"
        status: pass
      - kind: other
        ref: "rtk corepack pnpm --filter @agent-platform/worker-code typecheck"
        status: pass
      - kind: other
        ref: "rtk git diff --exit-code -- package.json pnpm-lock.yaml apps/worker-code/package.json apps/orchestrator-api/src/db/schema.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full Phase 6 verification gate passed after research helper extraction"
    requirement: VER-01
    verification:
      - kind: full
        ref: "rtk corepack pnpm verify"
        status: pass
    human_judgment: false
duration: 8m18s
completed: 2026-07-02
status: complete
---

# Phase 06 Plan 04: Research Output Seams Summary

**Research output helpers split into shared output and Instagram modules while preserving provider boundaries and research pack wording.**

## Performance

- **Duration:** 8m18s
- **Started:** 2026-07-02T18:42:52Z
- **Completed:** 2026-07-02T18:51:10Z
- **Tasks:** 3
- **Files modified:** 7 source/test files plus this summary

## Accomplishments

- Added `researchOutput.test.ts` as Wave 0 characterization for truncation, headings, limitation wording, source handling, redaction, landing brief assembly, and Instagram helpers.
- Added `researchOutput.ts` for shared Markdown/output helpers and redaction wrappers.
- Added `researchInstagram.ts` for Instagram handle extraction, provider handle normalization, and public profile URL formatting.
- Adopted the shared helpers in Firecrawl, Playwright, Instagram Graph, and Apify research modules without moving provider request/control-flow behavior.

## Artifact Check Files

- `apps/worker-code/src/executor/researchOutput.ts`
- `apps/worker-code/src/executor/researchInstagram.ts`

## TDD Evidence

- **RED:** `rtk corepack pnpm vitest run apps/worker-code/src/executor/researchOutput.test.ts` failed before extraction because `./researchOutput.js` did not exist.
- **GREEN:** After extraction, `researchOutput.test.ts` passed 6 tests, and the focused research provider gate passed 6 suites / 43 tests.

## Task Commits

1. **06-04-W0: Wave 0 research output characterization** - `7aea48c` (`test`)
2. **06-04-01: Research output and Instagram helper extraction** - `c603ccc` (`feat`)
3. **06-04-GATE: Full Phase 6 verification** - documented in this summary (`docs` metadata commit pending)

## Gate Evidence

- RED evidence: `rtk corepack pnpm vitest run apps/worker-code/src/executor/researchOutput.test.ts` failed with missing `./researchOutput.js` before production extraction.
- Focused research gate passed: `rtk corepack pnpm vitest run apps/worker-code/src/executor/researchOutput.test.ts apps/worker-code/src/executor/firecrawlResearch.test.ts apps/worker-code/src/executor/playwrightResearch.test.ts apps/worker-code/src/executor/scrapingPolicy.test.ts apps/worker-code/src/executor/instagramGraphResearch.test.ts apps/worker-code/src/executor/apifyInstagramResearch.test.ts` passed 6 suites / 43 tests.
- Worker typecheck passed: `rtk corepack pnpm --filter @agent-platform/worker-code typecheck`.
- Package/schema diff gate passed: `rtk git diff --exit-code -- package.json pnpm-lock.yaml apps/worker-code/package.json apps/orchestrator-api/src/db/schema.ts`.
- Owned-file Biome check passed for the 7 touched research source/test files.
- Full phase gate passed: `rtk corepack pnpm verify` checked 269 files with Biome, built all workspace packages, passed 94 Vitest files / 589 tests, eval 14/14, and regression eval 14/14 with score delta 0.

## Files Created/Modified

- `apps/worker-code/src/executor/researchOutput.ts` - Shared research pack headings, truncation, limitation, source evidence, landing brief, and redaction helpers.
- `apps/worker-code/src/executor/researchInstagram.ts` - Shared Instagram handle extraction, handle normalization, and profile URL helpers.
- `apps/worker-code/src/executor/researchOutput.test.ts` - Fail-first output helper characterization.
- `apps/worker-code/src/executor/firecrawlResearch.ts` - Delegates pure output, redaction, truncation, landing brief, and Instagram URL helpers to shared modules.
- `apps/worker-code/src/executor/playwrightResearch.ts` - Delegates research pack header, policy limitation, headings, and truncation helpers.
- `apps/worker-code/src/executor/instagramGraphResearch.ts` - Delegates handle normalization, redaction, heading, and inline truncation helpers while preserving URL/API behavior.
- `apps/worker-code/src/executor/apifyInstagramResearch.ts` - Delegates handle normalization, profile URL, redaction, heading, and inline truncation helpers while preserving actor/API behavior.

## Decisions Made

- Kept provider-specific finding section ownership in the provider modules while sharing only the heading constants and pure text helpers.
- Kept `extractInstagramHandles` re-exported from `firecrawlResearch.ts` for existing tests/import compatibility.
- Kept all provider calls, public/authorized boundaries, scraping policy, secret requirements, anti-blocking behavior, package files, schema files, route surfaces, deploy config, workflow labels, model aliases, and Plane behavior unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Formatted owned research seam files for Biome**
- **Found during:** Task 06-04-01 path-limited Biome check
- **Issue:** Biome reported import-order issues in newly touched research files.
- **Fix:** Ran path-limited `rtk corepack pnpm biome check --write` only on 06-04-owned research source/test files.
- **Files modified:** `apps/worker-code/src/executor/researchOutput.test.ts`, `apps/worker-code/src/executor/playwrightResearch.ts`
- **Verification:** Focused research gate, worker typecheck, package/schema diff gate, and owned-file Biome check passed.
- **Committed in:** `c603ccc`

**Total deviations:** 1 auto-fixed blocking issue.
**Impact on plan:** No behavior change and no scope expansion beyond owned research source/test files.

## Issues Encountered

- None beyond the scoped import-order formatting fix documented above.

## Known Stubs

None. Stub-pattern scan found only normal empty arrays/default parameters used as accumulators or optional defaults in research helper/provider code and tests.

## Threat Flags

None. The plan added no new network endpoint, auth path, file-access trust boundary, schema change, package change, route surface, provider call, or secret requirement. Existing provider network/secret surfaces stayed in their original modules.

## Auth Gates

None.

## User Setup Required

None - no external service configuration required.

## Phase 7 Readiness

Phase 6 now has runner, codegen, eval, and research seams extracted behind fail-first characterization. The final Phase 6 gate passed after 06-04, so Phase 7 can proceed to final verification and governance closeout without a known research-output blocker.

## Self-Check: PASSED

- Confirmed created research helper modules and characterization test exist on disk.
- Confirmed task commits `7aea48c` and `c603ccc` exist in git history.

---
*Phase: 06-worker-and-eval-hub-refactor*
*Completed: 2026-07-02*
