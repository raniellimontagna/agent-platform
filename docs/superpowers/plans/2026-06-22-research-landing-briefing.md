# Research Landing Briefing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic landing/page brief to data collector research output and prioritize it in the research→landing continuation context.

**Architecture:** Keep the existing `research` artifact as the transport format. Add a focused formatter in `firecrawlResearch.ts`, then update workflow context formatting to extract and promote `## Landing Page Brief` while appending the full research pack for traceability.

**Tech Stack:** TypeScript, Vitest, Markdown artifacts, existing worker/orchestrator modules.

## Global Constraints

- Use existing artifact kind `research`; do not add a database migration.
- Do not invent prices, testimonials, contacts, private analytics, or hidden content.
- Preserve Apify/Graph/Firecrawl limitations and secret redaction.
- Do not implement login, bypass, captcha avoidance, DMs, private analytics, or engagement automation.
- Use `rtk` for commands.

---

### Task 1: Research Pack Brief Section

**Files:**
- Modify: `apps/worker-code/src/executor/firecrawlResearch.test.ts`
- Modify: `apps/worker-code/src/executor/firecrawlResearch.ts`

**Interfaces:**
- Produces: `## Landing Page Brief` inside `JobResult.research`.
- Consumes: existing Firecrawl sources, Instagram handles, Instagram Graph findings, Apify findings, and persisted secret list.

- [ ] **Step 1: Write failing tests**

Add assertions to the Apify/Firecrawl research tests that `result.research` contains:

```ts
expect(result.research).toContain('## Landing Page Brief');
expect(result.research).toContain('### Brand / Subject');
expect(result.research).toContain('### Recommended Page Structure');
expect(result.research).toContain('@cameraecarburador');
expect(JSON.stringify(result)).not.toContain('apify-secret-token');
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `rtk corepack pnpm vitest run apps/worker-code/src/executor/firecrawlResearch.test.ts`

Expected: FAIL because the research pack has no `Landing Page Brief` section.

- [ ] **Step 3: Implement the brief formatter**

Add helper functions in `firecrawlResearch.ts`:

```ts
function formatLandingPageBrief(args: {
  job: Job;
  sources: ResearchSource[];
  instagramHandles: string[];
  graphFindings: InstagramGraphFinding[];
  apifyFindings: ApifyInstagramFinding[];
}): string[] {
  // Return deterministic Markdown lines for the output contract.
}
```

Insert the returned lines after the research metadata and before provider-specific findings.

- [ ] **Step 4: Run focused test and verify GREEN**

Run: `rtk corepack pnpm vitest run apps/worker-code/src/executor/firecrawlResearch.test.ts`

Expected: PASS.

### Task 2: Landing Workflow Context Promotion

**Files:**
- Modify: `apps/orchestrator-api/src/workflows.test.ts`
- Modify: `apps/orchestrator-api/src/workflows.ts`

**Interfaces:**
- Produces: `formatResearchToLandingContext(research, sourceRunId)` with the brief duplicated near the top under `## Structured landing/page brief`.
- Consumes: Markdown research strings that may or may not contain `## Landing Page Brief`.

- [ ] **Step 1: Write failing test**

Add a test that passes research containing `## Landing Page Brief`, another `##` section, and verifies:

```ts
expect(context.indexOf('## Structured landing/page brief')).toBeLessThan(
  context.indexOf('## Full research pack'),
);
expect(context).toContain('### Recommended Page Structure');
expect(context).toContain('# Research Pack');
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `rtk corepack pnpm vitest run apps/orchestrator-api/src/workflows.test.ts`

Expected: FAIL because the context currently only appends the raw research.

- [ ] **Step 3: Implement extraction**

Add `extractLandingPageBrief(research: string): string | undefined` in
`workflows.ts`. It should find `## Landing Page Brief` and stop before the next
top-level `## ` section.

- [ ] **Step 4: Run focused test and verify GREEN**

Run: `rtk corepack pnpm vitest run apps/orchestrator-api/src/workflows.test.ts`

Expected: PASS.

### Task 3: Docs, Smoke, Full Verification, Commit

**Files:**
- Modify: `docs/runbooks/data-collector-agent.md`
- Modify: `docs/runbooks/research-to-landing-workflow.md`

**Interfaces:**
- Documents: brief output contract and expected automated E2E validation.

- [ ] **Step 1: Update docs**

Document `Landing Page Brief` in both runbooks and state that the workflow
promotes the brief before the full research pack.

- [ ] **Step 2: Run real smoke**

Run a sanitized `runJob` smoke for `data-collector-agent` with
`@cameraecarburador`, `APIFY_INSTAGRAM_MAX_ITEMS=5`, and the ignored
`apps/worker-code/.env`.

Expected: `status: "succeeded"`, `hasBrief: true`, `hasApifyFindings: true`,
`hasToken: false`.

- [ ] **Step 3: Run full verification**

Run:

```bash
rtk corepack pnpm --filter @agent-platform/worker-code build
rtk corepack pnpm lint
rtk corepack pnpm test
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit and push**

Run:

```bash
rtk git add docs/superpowers/specs/2026-06-22-research-landing-briefing-design.md docs/superpowers/plans/2026-06-22-research-landing-briefing.md apps/worker-code/src/executor/firecrawlResearch.ts apps/worker-code/src/executor/firecrawlResearch.test.ts apps/orchestrator-api/src/workflows.ts apps/orchestrator-api/src/workflows.test.ts docs/runbooks/data-collector-agent.md docs/runbooks/research-to-landing-workflow.md
rtk git commit -m "feat(research): add landing brief to research packs"
rtk git push origin main
```

Expected: `main` pushed with clean worktree.

## Self-Review

- Spec coverage: the plan covers deterministic brief generation, workflow context
  promotion, docs, smoke, and full verification.
- Placeholder scan: no TODO/TBD placeholders.
- Type consistency: `formatLandingPageBrief` and `extractLandingPageBrief` are
  named consistently across implementation and tests.
