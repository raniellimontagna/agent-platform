# Apify Instagram Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Apify Instagram actor support as an optional external data source for `data-collector-agent`.

**Architecture:** Create a focused Apify executor module that calls the Actor synchronous dataset endpoint, normalizes returned items, and formats a research section. Wire it into the existing Firecrawl research job so Apify success counts as usable research while Firecrawl/Playwright remain fallback/audit paths.

**Tech Stack:** TypeScript, Node fetch, `zod`, Vitest, existing worker-code executor patterns.

## Global Constraints

- Use Apify as an external provider; do not copy or implement Apify scraping, proxy, anti-blocking, or bypass logic.
- Do not bypass login, captchas, rate limits, platform controls, paywalls, or private content.
- Keep `APIFY_TOKEN` optional; missing token must not break Graph API, Firecrawl, or Playwright paths.
- Never print or store `APIFY_TOKEN` in commands, research artifacts, errors, or logs.
- Use actor ID default `shu8hvrXbJbY3Eb9W`.
- Limit Apify Instagram output with `APIFY_INSTAGRAM_MAX_ITEMS`, default `20`.

---

## Task 1: Apify Executor

**Files:**
- Create: `apps/worker-code/src/executor/apifyInstagramResearch.ts`
- Create: `apps/worker-code/src/executor/apifyInstagramResearch.test.ts`

**Interfaces:**
- Produces `ApifyInstagramResearchOptions`, `ApifyInstagramFinding`,
  `runApifyInstagramResearch(handles, opts)`, and
  `formatApifyInstagramFindings(findings)`.

- [ ] Write tests for missing token skip, successful response normalization,
  API error limitation, and exact token redaction.
- [ ] Implement the module using
  `POST /v2/acts/{actorId}/run-sync-get-dataset-items?token=<redacted-token>`.
- [ ] Run:
  `rtk corepack pnpm vitest run apps/worker-code/src/executor/apifyInstagramResearch.test.ts`.

## Task 2: Wire Into Research Pack

**Files:**
- Modify: `apps/worker-code/src/executor/firecrawlResearch.ts`
- Modify: `apps/worker-code/src/executor/firecrawlResearch.test.ts`

**Interfaces:**
- Add `apifyInstagram?: ApifyInstagramResearchOptions` to
  `FirecrawlResearchOptions`.

- [ ] Add integration tests where Apify succeeds while Firecrawl fails for
  `instagram.com`, and where Apify is skipped with no token.
- [ ] Run Apify after Graph API handle extraction and before building the final
  research pack.
- [ ] Count successful Apify findings as usable research.
- [ ] Include `## Apify Instagram Findings` before `## Instagram Findings`.
- [ ] Run:
  `rtk corepack pnpm vitest run apps/worker-code/src/executor/apifyInstagramResearch.test.ts apps/worker-code/src/executor/firecrawlResearch.test.ts`.

## Task 3: Env, Docs, Secret, Verification

**Files:**
- Modify: `apps/worker-code/src/env.ts`
- Modify: `apps/worker-code/src/env.test.ts`
- Modify: `apps/worker-code/src/executor/runJob.ts`
- Modify: `apps/worker-code/.env.example`
- Modify: `infra/compose/runners/.env.example`
- Modify: `docs/runbooks/data-collector-agent.md`
- Modify: `docs/runbooks/secrets.md`
- Modify local ignored files only: `apps/worker-code/.env`, `infra/compose/runners/.env`

- [ ] Add optional envs: `APIFY_TOKEN`, `APIFY_INSTAGRAM_ACTOR_ID`,
  `APIFY_BASE_URL`, `APIFY_INSTAGRAM_MAX_ITEMS`, `APIFY_TIMEOUT_MS`.
- [ ] Pass env values from `runJob` into `runFirecrawlResearchJob`.
- [ ] Document Apify behavior, limitations, and secret rotation.
- [ ] Save the provided token only in ignored `.env` files with mode `600`.
- [ ] Run:
  `rtk corepack pnpm lint`
  `rtk corepack pnpm --filter @agent-platform/worker-code build`
  `rtk corepack pnpm test`
- [ ] Run one real smoke test against `@cameraecarburador` using the local
  token, without printing the token.

## Self-Review

- The plan covers the provider module, research pack wiring, env/docs/secrets,
  redaction, tests, and real smoke validation.
- The scope is one subsystem and does not require decomposition.
