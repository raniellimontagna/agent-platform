# AGP-8/AGP-9 Scraping Policy and Playwright Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Secure `data-collector-agent` scraping with a shared URL policy and add a controlled Playwright path for dynamic pages and screenshots.

**Architecture:** Add a focused scraping policy module used by Firecrawl and Playwright. Keep Firecrawl as default and select Playwright only for explicit dynamic/screenshot requests. Return all outputs through the existing `research` artifact.

**Tech Stack:** TypeScript ESM, Vitest, Zod, optional dynamic `playwright` import, worker-code package.

## Global Constraints

- Use `rtk` prefix for commands.
- Follow `CLAUDE.md` and Conventional Commits conventions.
- Do not touch cancelled or Done cards.
- Data collector only uses explicit URLs from the card or plan.
- Block internal/local/cloud metadata network targets and bypass instructions.

---

### Task 1: AGP-8 Scraping Policy

**Files:**
- Create: `apps/worker-code/src/executor/scrapingPolicy.ts`
- Create: `apps/worker-code/src/executor/scrapingPolicy.test.ts`
- Modify: `apps/worker-code/src/executor/firecrawlResearch.ts`
- Modify: `apps/worker-code/src/executor/firecrawlResearch.test.ts`
- Modify: `apps/worker-code/src/env.ts`

**Interfaces:**
- Produces: `buildScrapingPolicy(input): ScrapingPolicyResult`
- Produces: `extractExplicitUrls(text, limit?): string[]`
- Consumes: env limits from `env.ts`

- [ ] Write failing policy tests for allowed explicit URLs, localhost/private/metadata blocks, bypass-intent blocks, broad crawl blocks, and limit clamping.
- [ ] Run `rtk vitest run apps/worker-code/src/executor/scrapingPolicy.test.ts` and confirm failures.
- [ ] Implement `scrapingPolicy.ts`.
- [ ] Update Firecrawl to call the policy before scraping.
- [ ] Run focused Firecrawl and policy tests.

### Task 2: AGP-9 Controlled Playwright

**Files:**
- Create: `apps/worker-code/src/executor/playwrightResearch.ts`
- Create: `apps/worker-code/src/executor/playwrightResearch.test.ts`
- Modify: `apps/worker-code/src/executor/firecrawlResearch.ts`
- Modify: `apps/worker-code/src/executor/runJob.ts`
- Modify: `apps/worker-code/src/env.ts`

**Interfaces:**
- Produces: `runPlaywrightResearchJob(job, opts): Promise<JobResult>`
- Produces: `shouldUsePlaywrightResearch(job): boolean`
- Consumes: `buildScrapingPolicy`

- [ ] Write failing tests for Playwright selection, allowed navigation, out-of-scope navigation blocking, download/form blocking hooks, and research artifact output.
- [ ] Run `rtk vitest run apps/worker-code/src/executor/playwrightResearch.test.ts` and confirm failures.
- [ ] Implement the controlled executor with an injectable adapter for tests and dynamic Playwright loading for runtime.
- [ ] Route `data-collector-agent` jobs to Playwright when requested.
- [ ] Run focused Playwright and runJob tests.

### Task 3: Runbook and Verification

**Files:**
- Modify: `docs/runbooks/data-collector-agent.md`
- Modify: `apps/worker-code/.env.example`

**Interfaces:**
- Documents Firecrawl-vs-Playwright selection and required limits.

- [ ] Update the runbook with the policy contract and collector selection.
- [ ] Update `.env.example` with new limit variables.
- [ ] Run `rtk pnpm --filter @agent-platform/worker-code typecheck`.
- [ ] Run `rtk vitest run apps/worker-code/src/executor/commandPolicy.test.ts apps/worker-code/src/executor/scrapingPolicy.test.ts apps/worker-code/src/executor/firecrawlResearch.test.ts apps/worker-code/src/executor/playwrightResearch.test.ts apps/worker-code/src/executor/runJob.test.ts`.
- [ ] Run `rtk pnpm lint`.
- [ ] Request code review and address important findings.
- [ ] Update Plane cards AGP-8 and AGP-9 with completion notes.
