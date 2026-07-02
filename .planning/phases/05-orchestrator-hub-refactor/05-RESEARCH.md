# Phase 05: Orchestrator Hub Refactor - Research

**Researched:** 2026-07-02 [VERIFIED: current_date]
**Domain:** Hono orchestrator API route refactor, Plane webhook intake, Mission Control rendering, characterization testing [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md]
**Confidence:** HIGH for codebase topology and test inventory; MEDIUM for external framework guidance because Context7 MCP was unavailable and official docs were accessed through WebSearch [VERIFIED: codebase grep] [CITED: https://hono.dev/docs/guides/middleware] [CITED: https://vitest.dev/guide/mocking/modules]

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

## Implementation Decisions

### Refactor Posture

- **D-01:** Treat Phase 5 as behavior-preserving refactor work. Public routes,
  HTTP statuses, JSON shapes, HTML-visible strings/classes that tests depend on,
  queue payloads, run state transitions, and auth behavior must remain stable.
- **D-02:** Add or tighten characterization tests before moving behavior. Every
  risky extraction should have a RED or fail-first guard where practical, then
  pass after the refactor.
- **D-03:** Prefer small orchestrator-local modules over new packages. Do not add
  dependencies or introduce a new frontend/rendering framework.
- **D-04:** Use narrow commits by seam: shared route helpers, webhook seams, and
  admin/Mission Control rendering should be separable in history.

### Shared Route Helpers

- **D-05:** Shared helper extraction is in scope for duplicated route utilities
  such as bearer auth, HTML escaping, date formatting, status/pill classes, and
  small HTML response helpers.
- **D-06:** The shared auth helper must preserve the existing
  `RUNNER_AUTH_TOKEN` bearer-token contract and route coverage. Do not change
  admin/API auth policy or make any currently protected route public.
- **D-07:** HTML helpers must be boring and explicit. They may reduce duplication
  in `routes/admin.ts` and `routes/registry.ts`, but must not sanitize less than
  the current `escapeHtml` implementations.

### Webhook Hub

- **D-08:** Keep `/webhooks/plane` as the active intake path and
  `/webhooks/linear` as legacy compatibility only. Do not re-enable Linear as an
  active provider and do not remove legacy compatibility in this phase.
- **D-09:** Split webhook code around existing responsibilities: signature
  verification, Plane payload parsing, label-name/id extraction, label transition
  detection, removal/cancellation handling, ai-ready enqueueing, approval
  resume, and skip logging.
- **D-10:** Preserve idempotency and safety behavior: duplicate active runs are
  skipped, paused/cost-limit states skip enqueueing, removal events cancel active
  runs, and approval resumes only when `approved` is newly added.

### Admin And Mission Control

- **D-11:** Mission Control remains read-only. Do not add launch, replay,
  approve, retry, cancel, or deploy controls.
- **D-12:** Split admin/Mission Control by focused responsibilities:
  route handlers, mission summary data assembly, mission detail data assembly,
  JSON response shape, dashboard HTML rendering, detail HTML rendering, and
  reusable formatting/render helpers.
- **D-13:** Preserve current HTML inspection behavior and test-visible copy.
  Visual redesign is out of scope; extraction should make later UI work safer,
  not change the product surface now.

### Scope Fences

- **D-14:** Do not refactor worker execution, `runJob.ts`, `codegen.ts`, eval
  harness internals, or data-collector research modules in Phase 5; those belong
  to Phase 6.
- **D-15:** Do not change database schema, provider env defaults, Tailscale
  Funnel, Plane workspace labels, or production deployment configuration.
- **D-16:** If a seam turns out larger than expected, record the gap and defer it
  rather than expanding Phase 5 into a broad rewrite.

### Folded Todos

None.

### the agent's Discretion

No explicit `## the agent's Discretion` section exists in `05-CONTEXT.md`; the only discretion-like guidance is the recommended plan order under `## Specific Ideas`. [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md]

### Deferred Ideas (OUT OF SCOPE)

## Deferred Ideas

- Mission Control product UI rewrite or typed frontend rendering system remains
  future work (`FUT-01`), not Phase 5.
- Worker/eval/codegen/data-collector refactors remain Phase 6.
- Destructive Linear schema cleanup still requires separate explicit
  confirmation and is not part of Phase 5.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REF-01 | Shared route/auth/render helpers replace duplicated `requireAuth`, `escapeHtml`, `formatDate`, and similar local copies where appropriate. [VERIFIED: .planning/REQUIREMENTS.md] | `admin.ts`, `agents.ts`, `schedules.ts`, and `tools.ts` duplicate bearer auth; `admin.ts` and `registry.ts` duplicate HTML/date helpers; Hono supports route/path middleware extraction. [VERIFIED: codebase grep] [CITED: https://hono.dev/docs/guides/middleware] |
| REF-02 | Webhook handling is split into provider-neutral intake and Plane-specific parsing/transition logic. [VERIFIED: .planning/REQUIREMENTS.md] | `webhooks.ts` currently mixes signature verification, Plane parsing, label extraction, transition checks, cancellation, enqueue, resume, and legacy Linear compatibility in one 471-line route file. [VERIFIED: codebase grep] |
| VER-01 | Characterization tests protect behavior before each risky refactor. [VERIFIED: .planning/REQUIREMENTS.md] | Existing Phase 5 surface tests passed locally: 10 files / 90 tests; new Wave 0 gaps should target helper seams before moving logic. [VERIFIED: focused vitest run] |
</phase_requirements>

## Summary

Phase 5 should be planned as three narrow behavior-preserving refactor slices: shared route helpers first, Plane webhook seams second, and Mission Control admin/data/render seams third. [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md] The current hubs are `admin.ts` at 649 lines and `webhooks.ts` at 471 lines, and both already have meaningful route-level tests. [VERIFIED: wc -l] [VERIFIED: focused vitest run]

The safest first move is an orchestrator-local helper module, not a package or dependency change. [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md] Hono middleware can return a `Response` to stop processing or `await next()` to continue, and Hono route tests can call `app.request`, which matches the existing route test style. [CITED: https://hono.dev/docs/guides/middleware] [CITED: https://hono.dev/docs/guides/testing]

**Primary recommendation:** Plan Phase 5 as characterization-first extraction with no dependency changes: `routes/routeAuth.ts` for bearer auth, `routes/rendering.ts` for escape/date/status helpers, `webhookSignature.ts`, `planeWebhook.ts`, and `webhookRunActions.ts` for Plane signature/parsing/enqueue/resume/cancel, and `missionControlData.ts` plus `missionControlRender.ts` for admin data assembly and HTML rendering. [VERIFIED: codebase grep] [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md]

## Project Constraints (from AGENTS.md)

| Directive | Source | Planning Impact |
|-----------|--------|-----------------|
| `AGENTS.md` delegates canonical project rules to `CLAUDE.md`. | [VERIFIED: AGENTS.md] | Planner must treat `CLAUDE.md` as binding project guidance. |
| Use Conventional Commit branch and commit-message style. | [VERIFIED: CLAUDE.md] | Commit research and future plan/implementation work with Conventional Commit messages. |
| Prefix commands with `rtk`; command chains must prefix each command. | [VERIFIED: CLAUDE.md] | All verification commands in plans should use `rtk`, including `rtk corepack pnpm ...`. |
| Plane workspace `attodev`, project `Agent Platform` (`AGP`) is the primary provider; Linear is optional/legacy. | [VERIFIED: CLAUDE.md] | Phase 5 must preserve Plane-first behavior and not re-enable active Linear intake. |
| When completing cards, sync status/comments to the origin provider; Linear is only for original Linear cards. | [VERIFIED: CLAUDE.md] | This research does not complete a Plane card, but implementation plans should preserve Plane sync expectations. |
| Preserve unrelated dirty/untracked changes. | [VERIFIED: user request] | Planner should scope file edits to Phase 5 implementation files and avoid unrelated `.planning`/docs changes. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Shared bearer auth helper | API / Backend | Frontend Server (Hono route layer) | The `RUNNER_AUTH_TOKEN` check runs inside Hono route middleware and gates protected API/admin/schedule mutations. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts] [VERIFIED: apps/orchestrator-api/src/routes/schedules.ts] |
| HTML escaping/date/status formatting | API / Backend | Browser / Client | HTML is server-rendered strings from orchestrator routes; the browser only displays the generated document. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts] [VERIFIED: apps/orchestrator-api/src/routes/registry.ts] |
| Plane webhook parsing/signature verification | API / Backend | External Plane service boundary | `/webhooks/plane` reads raw request body, validates HMAC, parses Plane payloads, and decides transitions before run mutation. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts] [VERIFIED: docs/runbooks/webhook-tailscale.md] |
| Run enqueue/resume/cancel transitions | API / Backend | Database / Storage, Redis/BullMQ | Webhook handlers call `runs.ts` persistence helpers and `agentQueue.add` with `plan`/`resume` payloads. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts] [VERIFIED: apps/orchestrator-api/src/runs.ts] [VERIFIED: apps/orchestrator-api/src/queue.ts] |
| Mission Control data assembly | API / Backend | Database / Storage | Admin routes read runs, artifacts, approvals, scenarios, and timelines before returning JSON or HTML. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts] [VERIFIED: apps/orchestrator-api/src/missionTimeline.ts] |
| Mission Control HTML rendering | API / Backend | Browser / Client | `renderMissionControlPage` and `renderMissionDetailPage` return complete HTML pages; Mission Control remains read-only. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts] [VERIFIED: docs/runbooks/mission-control.md] |

## Standard Stack

### Core

| Library / Module | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| `hono` | Locked 4.12.25 in `pnpm-lock.yaml`; latest registry 4.12.27 published 2026-06-23. [VERIFIED: npm view] | HTTP routes, middleware, `c.json`, `c.html`, and route tests. [VERIFIED: apps/orchestrator-api/package.json] | Existing orchestrator API framework; Hono officially supports reusable middleware and `app.request` tests. [CITED: https://hono.dev/docs/guides/middleware] [CITED: https://hono.dev/docs/guides/testing] |
| `@hono/node-server` | Locked 1.19.14 in `pnpm-lock.yaml`; latest registry 2.0.8 published 2026-07-02. [VERIFIED: npm view] | Node server adapter for the orchestrator API. [VERIFIED: apps/orchestrator-api/src/index.ts] | Existing bootstrap uses `serve({ fetch: app.fetch, port })`. [VERIFIED: apps/orchestrator-api/src/index.ts] |
| `vitest` | Installed 3.2.6; latest registry 4.1.9 published 2026-06-15. [VERIFIED: npm view] | Characterization tests and module mocks. [VERIFIED: package.json] | Existing tests use `vi.mock`, `vi.mocked`, and Hono `app.request`; Vitest docs warn to clear/restore mocks and explain same-file mocking limits. [VERIFIED: codebase grep] [CITED: https://vitest.dev/guide/mocking] [CITED: https://vitest.dev/guide/mocking/modules] |
| `bullmq` | Locked 5.34.0 in `pnpm-lock.yaml`; latest registry 5.79.2 published 2026-06-27. [VERIFIED: npm view] | `agent-runs` queue payload contract and priorities. [VERIFIED: apps/orchestrator-api/src/queue.ts] | Existing queue owns `plan` and `resume`; BullMQ official docs define job priority behavior. [VERIFIED: apps/orchestrator-api/src/queue.ts] [CITED: https://docs.bullmq.io/guide/jobs/prioritized] |

### Supporting

| Library / Module | Version | Purpose | When to Use |
|------------------|---------|---------|-------------|
| `zod` | Declared `^3.24.2` in orchestrator API package. [VERIFIED: apps/orchestrator-api/package.json] | Request payload validation in route modules. [VERIFIED: apps/orchestrator-api/src/routes/agents.ts] [VERIFIED: apps/orchestrator-api/src/routes/tools.ts] | Keep for existing agent/tool route validation; do not expand scope unless helper extraction touches validation boilerplate. [VERIFIED: codebase grep] |
| `drizzle-orm` | Declared `^0.38.4` in orchestrator API package. [VERIFIED: apps/orchestrator-api/package.json] | Run/artifact/approval persistence access. [VERIFIED: apps/orchestrator-api/src/runs.ts] [VERIFIED: apps/orchestrator-api/src/artifacts.ts] | Do not change schema or query behavior in Phase 5; only move data assembly callers if covered. [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md] |
| Node `crypto` | Node v22.22.3 available locally. [VERIFIED: node --version] | HMAC signature verification and timing-safe comparison. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts] | Keep the current `createHmac` + `timingSafeEqual` semantics when extracting signature helpers. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom shared auth middleware | Hono built-in `bearerAuth` | `bearerAuth` is official and supports token/header customization, but switching would alter response bodies/status details unless carefully wrapped; Phase 5 should preserve the exact current `{ error: "unauthorized" }` JSON and 401 behavior. [CITED: https://hono.dev/docs/middleware/builtin/bearer-auth] [VERIFIED: apps/orchestrator-api/src/routes/admin.test.ts] |
| String HTML render helpers | JSX renderer or frontend framework | Hono has helpers/rendering options, but CONTEXT forbids a new frontend/rendering framework in Phase 5. [CITED: https://hono.dev/docs/guides/middleware] [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md] |
| Large provider-neutral webhook rewrite | Small Plane-focused parser/transition modules | REF-02 asks for provider-neutral intake and Plane-specific parsing/transition logic, but D-08 preserves legacy Linear compatibility and active Plane behavior; broad provider migration belongs outside Phase 5. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md] |

**Installation:**

```bash
# No package install for Phase 5. Existing packages are sufficient. [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md]
```

**Version verification commands run:**

```bash
rtk npm view hono version time --json
rtk npm view vitest version time --json
rtk npm view bullmq version time --json
rtk npm view @hono/node-server version time --json
```

## Package Legitimacy Audit

Phase 5 should install no external packages. [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md] The audit below covers already-used stack packages because they appear in the Standard Stack; latest registry releases were flagged `SUS` by the GSD seam only because they are too new, so do not upgrade during this refactor. [VERIFIED: package-legitimacy check]

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `hono` | npm | Latest 4.12.27 published 2026-06-23; locked 4.12.25 published 2026-06-09. [VERIFIED: npm view] | 47,576,301/wk [VERIFIED: package-legitimacy check] | `github.com/honojs/hono` [VERIFIED: package-legitimacy check] | SUS latest release too new [VERIFIED: package-legitimacy check] | No install or upgrade; keep lockfile. |
| `vitest` | npm | Latest 4.1.9 published 2026-06-15; installed 3.2.6 published 2026-06-01. [VERIFIED: npm view] | 68,928,372/wk [VERIFIED: package-legitimacy check] | `github.com/vitest-dev/vitest` [VERIFIED: package-legitimacy check] | SUS latest release too new [VERIFIED: package-legitimacy check] | No install or upgrade; use existing test runner. |
| `bullmq` | npm | Latest 5.79.2 published 2026-06-27; locked 5.34.0 published 2024-12-10. [VERIFIED: npm view] | 6,386,775/wk [VERIFIED: package-legitimacy check] | `github.com/taskforcesh/bullmq` [VERIFIED: package-legitimacy check] | SUS latest release too new [VERIFIED: package-legitimacy check] | No install or upgrade; preserve current queue behavior. |
| `@hono/node-server` | npm | Latest 2.0.8 published 2026-07-02; locked 1.19.14 published 2026-04-13. [VERIFIED: npm view] | 41,383,783/wk [VERIFIED: package-legitimacy check] | `github.com/honojs/node-server` [VERIFIED: package-legitimacy check] | SUS latest release too new [VERIFIED: package-legitimacy check] | No install or upgrade; not part of route refactor. |

**Packages removed due to [SLOP] verdict:** none. [VERIFIED: package-legitimacy check]
**Packages flagged as suspicious [SUS]:** latest `hono`, `vitest`, `bullmq`, and `@hono/node-server` releases only because they are too new; Phase 5 should not install or upgrade them. [VERIFIED: package-legitimacy check]

## Architecture Patterns

### System Architecture Diagram

```text
Plane webhook request
  -> Hono /webhooks/plane route
  -> signature helper
  -> Plane payload parser
  -> transition detector using labelJustAdded
  -> decision:
       removal/archive -> cancelActiveRunsForCard -> JSON { ok, cancelled, reason }
       approved added  -> findAwaitingApprovalRunForCard -> resolveApproval -> updateRunStatus -> BullMQ resume
       ai-ready added  -> duplicate/pause/cost checks -> createRun -> BullMQ plan
       no transition   -> skip logger -> JSON { ok, skipped, reason }

Protected admin/operator request
  -> shared bearer auth helper using RUNNER_AUTH_TOKEN
  -> route handler:
       status/runners/concurrency/card-runs -> JSON
       mission summaries/detail -> data assembly helpers -> render helpers -> c.html(...)

Registry/admin HTML
  -> route-local data fetch
  -> shared escapeHtml/formatDate/status-class helpers
  -> route-specific HTML renderers
```

Every arrow above maps to current code paths in `webhooks.ts`, `admin.ts`, `registry.ts`, `runs.ts`, and `queue.ts`. [VERIFIED: codebase grep]

### Recommended Project Structure

```text
apps/orchestrator-api/src/
├── routes/
│   ├── routeAuth.ts                 # bearer auth middleware
│   ├── rendering.ts                 # escapeHtml, formatDate, humanizeStatus helpers
│   ├── admin.ts                     # route registration and thin handlers
│   ├── registry.ts                  # route registration + registry-specific renderer use
│   └── webhooks.ts                  # route registration and provider dispatch
├── webhookSignature.ts              # verifySignature / verifyPlaneSignature preserving env behavior
├── planeWebhook.ts                  # Plane event, card id, identifier, labels, removal action parsing
├── webhookRunActions.ts             # ai-ready enqueue, approval resume, removal cancel orchestration
├── missionControlData.ts            # recent summaries, detail data, related runs/artifacts/approvals
└── missionControlRender.ts          # dashboard/detail HTML renderers
```

This structure keeps modules orchestrator-local and avoids new packages, matching D-03. [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md]

### Pattern 1: Shared Hono Bearer Middleware

**What:** Extract current `authorization === Bearer ${env.RUNNER_AUTH_TOKEN}` checks into a shared middleware factory or exported middleware that returns the same 401 JSON. [VERIFIED: codebase grep]

**When to use:** Protected admin routes, schedules routes, and write routes for agents/tools; do not make currently open read routes protected. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts] [VERIFIED: apps/orchestrator-api/src/routes/agents.ts] [VERIFIED: apps/orchestrator-api/src/routes/tools.ts] [VERIFIED: apps/orchestrator-api/src/routes/schedules.ts]

**Example:**

```typescript
// Source: current route behavior + Hono middleware docs.
// [VERIFIED: apps/orchestrator-api/src/routes/admin.ts]
// [CITED: https://hono.dev/docs/guides/middleware]
export async function requireRunnerAuth(c: Context, next: Next) {
  if (c.req.header('authorization') !== `Bearer ${env.RUNNER_AUTH_TOKEN}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}
```

### Pattern 2: Pure Parser First, Side Effects Second

**What:** Move Plane payload parsing and transition classification into pure functions, then keep database/queue calls in small orchestration functions. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts]

**When to use:** Splitting `routes/webhooks.ts` around Plane parsing/signature/labels/transitions/enqueue/resume/cancel. [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md]

**Example:**

```typescript
// Source: current Plane route branch ordering.
// [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts]
const event = parsePlaneWebhook(payload, eventHeader);
if (!event.supported) return c.json(skipPlaneWebhook(event.reason, event.audit));
if (event.removed) return c.json(await cancelPlaneCardRuns(event.card));
if (event.approvedJustAdded) return c.json(await resumePlaneApproval(event.card));
if (event.aiReadyJustAdded) return c.json({ ok: true, ...(await enqueuePlaneRun(event.card)) });
return c.json(skipPlaneWebhook(event.reason, event.audit));
```

### Pattern 3: Mission Data Assembly Separate From Rendering

**What:** Export Mission Control data assembly separately from render functions so tests can assert JSON/data behavior without string-searching HTML. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts]

**When to use:** Moving `buildRecentMissionSummaries`, `listMissionRunsForSource`, artifact aggregation, approval aggregation, dashboard rendering, and detail rendering. [VERIFIED: codebase grep]

**Example:**

```typescript
// Source: current admin route responsibilities.
// [VERIFIED: apps/orchestrator-api/src/routes/admin.ts]
const missions = await buildRecentMissionSummaries(safeLimit, listE2eMissionScenarios());
return c.json({ missions });
```

### Anti-Patterns to Avoid

- **Changing HTTP response shape during extraction:** Existing tests assert 401/400/410/200 statuses and JSON bodies; preserve exact shapes. [VERIFIED: apps/orchestrator-api/src/routes/admin.test.ts] [VERIFIED: apps/orchestrator-api/src/routes/webhooks.test.ts]
- **Moving `labelJustAdded` semantics into a new duplicate implementation:** `cardWebhook.ts` already owns newly-added label behavior, including missing previous labels behavior. [VERIFIED: apps/orchestrator-api/src/cardWebhook.ts]
- **Using BullMQ priority numbers backwards:** Current code defines `resume: 1` and `plan: 2`; BullMQ docs say lower numeric values have higher priority. [VERIFIED: apps/orchestrator-api/src/queue.ts] [CITED: https://docs.bullmq.io/guide/jobs/prioritized]
- **Mocking same-file internal calls after extraction:** Vitest docs state module mocks cannot intercept direct same-file internal references; move seams into separate modules or inject dependencies before relying on mocks. [CITED: https://vitest.dev/guide/mocking/modules]
- **Treating Mission Control as an action surface:** The runbook and Phase 5 context state Mission Control remains read-only. [VERIFIED: docs/runbooks/mission-control.md] [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hono route auth plumbing | Per-route duplicate `requireAuth` functions | Shared orchestrator-local Hono middleware preserving exact response | Hono middleware is the framework-supported seam; duplication exists in four route files. [CITED: https://hono.dev/docs/guides/middleware] [VERIFIED: codebase grep] |
| Label transition semantics | New ad hoc label diff logic | Existing `labelJustAdded` | It already handles names, ids, create vs update, and missing previous labels. [VERIFIED: apps/orchestrator-api/src/cardWebhook.ts] |
| Queue priority model | Custom priority ordering or magic comments | Existing `JOB_PRIORITY` constants and BullMQ `priority` option | BullMQ defines lower numeric priority as higher priority; current constants encode resume before plan. [VERIFIED: apps/orchestrator-api/src/queue.ts] [CITED: https://docs.bullmq.io/guide/jobs/prioritized] |
| Date formatting | Multiple route-local implementations | Shared explicit `formatDate` with current ISO replacement behavior | `admin.ts` and `registry.ts` duplicate the same behavior. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts] [VERIFIED: apps/orchestrator-api/src/routes/registry.ts] |
| HTML escaping | New partial escaping or sanitizer replacement | Shared exact `escapeHtml` covering `& < > \" '`, with tests | `admin.ts`, `registry.ts`, and `packages/cards` use equivalent escaping; Phase 5 must not sanitize less. [VERIFIED: codebase grep] [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md] |

**Key insight:** The hard part is not framework mechanics; it is preserving route-visible contracts while moving side effects behind named seams. [VERIFIED: focused vitest run] [VERIFIED: apps/orchestrator-api/src/routes/webhooks.test.ts]

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None requiring migration. Runs, approvals, artifacts, schedules, and legacy Linear columns remain untouched by Phase 5. [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md] [VERIFIED: apps/orchestrator-api/src/runs.ts] [VERIFIED: apps/orchestrator-api/src/artifacts.ts] | No data migration. Preserve `createRun`, `listRunsForCard`, `cancelActiveRunsForCard`, and approval behavior. |
| Live service config | Plane/Tailscale/BullMQ runtime config exists, but Phase 5 explicitly must not change Tailscale Funnel, Plane workspace labels, provider env defaults, or production deployment config. [VERIFIED: docs/runbooks/webhook-tailscale.md] [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md] | Code refactor only; no live service patch. |
| OS-registered state | None found in Phase 5 scope; routes are registered through `buildApp()` imports, not OS service names. [VERIFIED: apps/orchestrator-api/src/app.ts] | No OS re-registration. |
| Secrets/env vars | `RUNNER_AUTH_TOKEN`, `PLANE_WEBHOOK_SECRET`, and legacy Linear secrets are read by route code; Phase 5 must preserve names and semantics. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts] [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts] | Code edit only; no secret rename or env migration. |
| Build artifacts | None specific to the refactor; TypeScript build output is generated from source. [VERIFIED: apps/orchestrator-api/package.json] | Run typecheck/build after extraction; no artifact cleanup required. |

**Nothing found in category:** Each category above is explicitly answered; no runtime state mutation is required for this behavior-preserving refactor. [VERIFIED: codebase grep]

## Common Pitfalls

### Pitfall 1: Auth Coverage Drift

**What goes wrong:** Protected admin/schedule/write routes become public, or open read routes become protected by accident. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts] [VERIFIED: apps/orchestrator-api/src/routes/agents.ts]
**Why it happens:** A shared middleware extraction can be applied too broadly when moving from route-local `post`/`patch` middleware to `use` middleware. [VERIFIED: apps/orchestrator-api/src/routes/agents.ts] [VERIFIED: apps/orchestrator-api/src/routes/tools.ts]
**How to avoid:** Add fail-first tests for each protected/open route class before replacing local middleware. [VERIFIED: apps/orchestrator-api/src/routes/agents.test.ts] [VERIFIED: apps/orchestrator-api/src/routes/tools.test.ts]
**Warning signs:** `GET /agents` or `GET /tools` starts returning 401, or `POST /agents` without bearer reaches validation instead of 401. [VERIFIED: apps/orchestrator-api/src/routes/agents.test.ts] [VERIFIED: apps/orchestrator-api/src/routes/tools.test.ts]

### Pitfall 2: Plane Transition Regression

**What goes wrong:** Updates with existing `ai-ready` enqueue duplicate runs, missing previous labels enqueue unexpectedly, or approval resumes without a newly-added `approved` label. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.test.ts]
**Why it happens:** Label parsing and transition logic are currently intertwined with the route branch order. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts]
**How to avoid:** Extract parser/classifier as pure functions and test name/id labels, `updated_from`/`updatedFrom`, `create` vs `update`, delete/archive before label checks, and missing previous labels. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts] [VERIFIED: apps/orchestrator-api/src/cardWebhook.ts]
**Warning signs:** `agentQueue.add` is called in skip/cancel test cases or `cancelActiveRunsForCard` is not called before enqueue/resume checks. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.test.ts]

### Pitfall 3: Queue Priority Regression

**What goes wrong:** Approval resume jobs stop jumping ahead of new plan jobs. [VERIFIED: apps/orchestrator-api/src/queue.ts]
**Why it happens:** BullMQ lower numeric priority is higher priority; it is easy to read `20 > 10` as higher priority when mocking constants. [CITED: https://docs.bullmq.io/guide/jobs/prioritized]
**How to avoid:** Assert actual `JOB_PRIORITY.resume` and `JOB_PRIORITY.plan` usage from the production constant, not only mocked numbers. [VERIFIED: apps/orchestrator-api/src/queue.ts]
**Warning signs:** Tests use `{ priority: 20 }` mocks while production constants are `{ resume: 1, plan: 2 }`; keep mock expectations aligned if tests are moved. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.test.ts] [VERIFIED: apps/orchestrator-api/src/queue.ts]

### Pitfall 4: HTML Escaping Regression

**What goes wrong:** A renderer extraction drops escaping for links, stage labels, run titles, artifact IDs, PR URLs, or registry capabilities. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts] [VERIFIED: apps/orchestrator-api/src/routes/registry.ts]
**Why it happens:** Current render functions concatenate many template strings with repeated `escapeHtml` calls. [VERIFIED: codebase grep]
**How to avoid:** Add helper-level escape tests for `& < > " '` and renderer tests with malicious values before moving render functions. [VERIFIED: apps/orchestrator-api/src/routes/registry.test.ts]
**Warning signs:** HTML tests only assert happy-path copy and not escaped attacker-controlled fields. [VERIFIED: apps/orchestrator-api/src/routes/admin.test.ts]

### Pitfall 5: Mission Grouping Drift

**What goes wrong:** Mission Control detail/summary includes unrelated runs from the same card or misses landing continuation runs. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts] [VERIFIED: apps/orchestrator-api/src/routes/admin.test.ts]
**Why it happens:** `listMissionRunsForSource` bounds related runs between source workflow runs using card identity and created-at order. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts]
**How to avoid:** Add data-helper tests for multiple source workflow runs on the same card before extracting summary/detail data assembly. [VERIFIED: codebase grep]
**Warning signs:** Summary state for a completed collector plus later landing run no longer resolves to `landing_generation`. [VERIFIED: apps/orchestrator-api/src/routes/admin.test.ts]

## Code Examples

### Hono Route Characterization

```typescript
// Source: Hono official testing docs and existing route tests.
// [CITED: https://hono.dev/docs/guides/testing]
// [VERIFIED: apps/orchestrator-api/src/routes/admin.test.ts]
const app = new Hono();
app.route('/', adminRoute);

const res = await app.request('/admin/concurrency', {
  headers: { authorization: 'Bearer secret' },
});
expect(res.status).toBe(200);
```

### Vitest Partial Module Mock

```typescript
// Source: Vitest module mocking docs and existing test pattern.
// [CITED: https://vitest.dev/guide/mocking/modules]
// [VERIFIED: apps/orchestrator-api/src/routes/webhooks.test.ts]
vi.mock('../agents.js', async (orig) => ({
  ...(await orig<typeof import('../agents.js')>()),
  resolveAgentByKey: vi.fn(),
}));
```

### BullMQ Priority Preservation

```typescript
// Source: current queue contract and BullMQ priority docs.
// [VERIFIED: apps/orchestrator-api/src/queue.ts]
// [CITED: https://docs.bullmq.io/guide/jobs/prioritized]
await agentQueue.add('resume', { kind: 'resume', runId }, { priority: JOB_PRIORITY.resume });
await agentQueue.add('plan', { kind: 'plan', runId, cardProvider, cardId }, { priority: JOB_PRIORITY.plan });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Repeated route-local auth/date/HTML helpers | Small shared helper modules with route-level characterization tests | Phase 5 target, not yet implemented. [VERIFIED: .planning/ROADMAP.md] | Reduces duplication while preserving Hono route contracts. [VERIFIED: codebase grep] |
| Linear as an active provider path | Plane active, Linear legacy/migration-only compatibility | Phase 3 completed 2026-07-02. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/STATE.md] | Webhook refactor must keep `/webhooks/plane` active and not re-enable Linear. [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md] |
| Mission Control as route-local data/render hub | Mission scenario and timeline domain helpers already exist; Phase 5 should finish data/render separation | Mission Control helpers exist before Phase 5. [VERIFIED: apps/orchestrator-api/src/missionScenarios.ts] [VERIFIED: apps/orchestrator-api/src/missionTimeline.ts] | Admin split can build on existing domain seams instead of inventing a UI framework. [VERIFIED: docs/runbooks/mission-control.md] |

**Deprecated/outdated:**

- Active Linear intake is deprecated for normal operation; `/webhooks/linear` remains compatibility-only and disabled unless `CARD_EXTRA_PROVIDERS=linear`. [VERIFIED: docs/CURRENT.md] [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts]
- Mission Control operator actions are deferred; read-only inspection is current behavior. [VERIFIED: docs/runbooks/mission-control.md] [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md]

## Existing Tests And Characterization Gaps

| Surface | Existing Coverage | Gap To Close Before Refactor |
|---------|-------------------|------------------------------|
| Shared auth | Admin, agents, tools, schedules tests assert selected 401 paths. [VERIFIED: focused vitest run] | Add/confirm tests for unchanged open reads (`GET /agents`, `GET /tools`) and all protected writes after shared middleware import. [VERIFIED: apps/orchestrator-api/src/routes/agents.test.ts] [VERIFIED: apps/orchestrator-api/src/routes/tools.test.ts] |
| HTML/date helpers | Registry tests assert escaping; admin render tests assert read-only copy and key visible strings. [VERIFIED: apps/orchestrator-api/src/routes/registry.test.ts] [VERIFIED: apps/orchestrator-api/src/routes/admin.test.ts] | Add helper-level tests for shared `escapeHtml` and `formatDate`; add admin malicious-value fixture before moving renderers. [VERIFIED: codebase grep] |
| Plane webhook parsing | Route tests cover work_item, issue event, `updated_from`, `updatedFrom`, delete/archive, missing ID, missing previous labels, unsigned test behavior. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.test.ts] | Add pure parser tests for label ID-only payloads, project identifier fallback, unsupported event audit shape, and malformed JSON behavior if planner chooses to lock it. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts] |
| Plane transitions | Route tests cover enqueue, approval resume, cancellation, skip already-present label, skip missing previous labels. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.test.ts] | Add tests for paused agents, daily budget exceeded, active run duplicate, unique-violation duplicate, approval-with-no-run skip, and `repo:create`/workflow behavior for Plane path. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts] |
| Mission data assembly | Admin tests cover recent summaries, landing continuation inclusion, alias routes, detail page, card-runs audit. [VERIFIED: apps/orchestrator-api/src/routes/admin.test.ts] | Add data-helper tests for safe limit normalization, multiple source workflow runs on same card, no `cardId` fallback, and unknown scenario 404 before moving data helpers. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts] |
| Mission rendering | Admin tests assert dashboard/detail copy and empty states. [VERIFIED: apps/orchestrator-api/src/routes/admin.test.ts] | Add renderer tests for escaped run title/card/PR URL/stage labels and stable `content-type` route responses after renderer move. [VERIFIED: codebase grep] |

**Baseline command run:** `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/routes/registry.test.ts apps/orchestrator-api/src/routes/agents.test.ts apps/orchestrator-api/src/routes/schedules.test.ts apps/orchestrator-api/src/routes/tools.test.ts apps/orchestrator-api/src/missionScenarios.test.ts apps/orchestrator-api/src/missionTimeline.test.ts apps/orchestrator-api/src/artifacts.test.ts apps/orchestrator-api/src/routes/artifacts.test.ts` passed 10 files / 90 tests. [VERIFIED: focused vitest run]

**Typecheck command run:** `rtk corepack pnpm --filter @agent-platform/orchestrator-api typecheck` exited 0. [VERIFIED: typecheck run]

## Recommended Plan Boundaries

| Plan | Scope | Must Not Include |
|------|-------|------------------|
| 05-01 Shared route helpers | `routes/routeAuth.ts` for bearer auth plus `routes/rendering.ts` for `escapeHtml`, `formatDate`, `humanizeStatus`, and route tests. [VERIFIED: codebase grep] | Webhook behavior changes, Mission Control data moves, package installs, auth policy changes. [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md] |
| 05-02 Webhook seams | `webhookSignature.ts`, `planeWebhook.ts`, and `webhookRunActions.ts` for Plane signature/parser/transition modules and enqueue/resume/cancel helpers, with route contract preserved. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts] | Linear removal, provider env default changes, queue payload shape changes, worker/eval refactors. [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md] |
| 05-03 Admin/Mission Control seams | `missionControlData.ts` and `missionControlRender.ts` for Mission summary/detail data helpers and dashboard/detail render helpers, preserving JSON and HTML-visible copy. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts] | Product UI redesign, operator actions, schema changes, artifact API changes. [VERIFIED: docs/runbooks/mission-control.md] |

## Resolved Questions

| Question | Resolution |
|----------|------------|
| Should Phase 5 add packages or adopt a renderer? | No. D-03 forbids new dependencies/frameworks; existing Hono/Vitest/BullMQ stack is enough. [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md] |
| Should Linear webhook compatibility be removed while splitting `webhooks.ts`? | No. D-08 preserves `/webhooks/linear` as legacy compatibility and forbids active Linear re-enable/removal in this phase. [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md] |
| Should Mission Control gain controls during the admin split? | No. D-11 and the runbook keep it read-only; launch/replay/approval/retry/cancel/deploy controls are deferred. [VERIFIED: .planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md] [VERIFIED: docs/runbooks/mission-control.md] |
| Is graph context available? | No. `.planning/graphs/graph.json` was absent and `gsd-tools graphify status` returned disabled. [VERIFIED: graphify status] |

## Assumptions Log

All claims in this research were verified or cited in this session; no user confirmation is needed before planning. [VERIFIED: sources audit]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| `rtk` | Project command wrapper | yes [VERIFIED: rtk --version] | 0.42.4 [VERIFIED: rtk --version] | None needed; note project filters are untrusted but commands still executed. [VERIFIED: command output] |
| Node.js | TypeScript runtime/tooling | yes [VERIFIED: node --version] | v22.22.3 [VERIFIED: node --version] | None needed. |
| `pnpm` via Corepack | Workspace tests/build | yes [VERIFIED: corepack pnpm --version] | 11.5.2 [VERIFIED: corepack pnpm --version] | None needed. |
| Vitest | Characterization tests | yes [VERIFIED: vitest --version] | 3.2.6 [VERIFIED: vitest --version] | None needed. |
| TypeScript compiler | Typecheck/build | yes [VERIFIED: tsc --version] | 5.9.3 installed [VERIFIED: tsc --version] | None needed. |
| Biome | Lint/verify | yes [VERIFIED: biome --version] | 1.9.4 [VERIFIED: biome --version] | None needed. |
| Git | Commit research artifact | yes [VERIFIED: git --version] | 2.39.5 [VERIFIED: git --version] | None needed. |

**Missing dependencies with no fallback:** none found. [VERIFIED: environment probes]

**Missing dependencies with fallback:** Context7 MCP and `ctx7` CLI were unavailable; official docs were accessed via WebSearch and confidence was classified MEDIUM. [VERIFIED: command -v ctx7] [VERIFIED: classify-confidence]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.6 [VERIFIED: vitest --version] |
| Config file | `vitest.config.ts` in the repository root. [VERIFIED: vitest.config.ts] |
| Quick run command | `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/routes/registry.test.ts apps/orchestrator-api/src/routes/agents.test.ts apps/orchestrator-api/src/routes/schedules.test.ts apps/orchestrator-api/src/routes/tools.test.ts` |
| Full suite command | `rtk corepack pnpm verify` [VERIFIED: docs/CURRENT.md] |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| REF-01 | Shared auth/render/date helpers preserve route auth policy and HTML escaping/date output. [VERIFIED: .planning/REQUIREMENTS.md] | unit + route characterization | `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/routes/registry.test.ts apps/orchestrator-api/src/routes/agents.test.ts apps/orchestrator-api/src/routes/schedules.test.ts apps/orchestrator-api/src/routes/tools.test.ts` | Existing route files yes; helper test should be Wave 0. [VERIFIED: codebase grep] |
| REF-02 | Webhook handling preserves Plane parsing, label transitions, enqueue/resume/cancel, and legacy Linear compatibility. [VERIFIED: .planning/REQUIREMENTS.md] | route + unit characterization | `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/cardWebhook.test.ts apps/orchestrator-api/src/queue.test.ts apps/orchestrator-api/src/runs.test.ts` | Existing route/support tests yes; parser/transition helper tests should be Wave 0. [VERIFIED: codebase grep] |
| VER-01 | Characterization tests fail before risky movement and pass after extraction. [VERIFIED: .planning/REQUIREMENTS.md] | unit + route characterization | Per seam quick command above plus `rtk corepack pnpm --filter @agent-platform/orchestrator-api typecheck` | Existing tests yes; Wave 0 gaps listed below. [VERIFIED: focused vitest run] |

### Sampling Rate

- **Per task commit:** Run the affected quick command for that seam and `rtk corepack pnpm --filter @agent-platform/orchestrator-api typecheck`. [VERIFIED: typecheck run]
- **Per wave merge:** Run the Phase 5 focused command covering admin/webhooks/registry/route-auth/artifacts/mission helpers. [VERIFIED: focused vitest run]
- **Phase gate:** Run `rtk corepack pnpm verify` before `$gsd-verify-work`. [VERIFIED: docs/CURRENT.md]

### Wave 0 Gaps

- [ ] `apps/orchestrator-api/src/routes/routeAuth.test.ts` - covers REF-01 shared `requireRunnerAuth` behavior. [VERIFIED: codebase grep]
- [ ] `apps/orchestrator-api/src/routes/rendering.test.ts` - covers REF-01 shared `escapeHtml`, `formatDate`, and `humanizeStatus` behavior. [VERIFIED: codebase grep]
- [ ] `apps/orchestrator-api/src/planeWebhook.test.ts` - covers REF-02 Plane event support, card identifier fallback, label name/id extraction, `updated_from` and `updatedFrom`. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts]
- [ ] `apps/orchestrator-api/src/webhookRunActions.test.ts` - covers REF-02 paused/cost/duplicate/unique-violation enqueue skips and approval-with-no-run skip. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts]
- [ ] `apps/orchestrator-api/src/missionControlData.test.ts` - covers REF-01/VER-01 Mission Control data assembly boundaries before moving `buildRecentMissionSummaries` and `listMissionRunsForSource`. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts]
- [ ] `apps/orchestrator-api/src/missionControlRender.test.ts` - covers REF-01 HTML escaping and read-only Mission Control copy before moving renderers. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts]

## Security Domain

Security enforcement is enabled because `.planning/config.json` does not set `security_enforcement: false`. [VERIFIED: .planning/config.json]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V1 Encoding and Sanitization | yes | Preserve or improve current HTML escaping for server-rendered admin/registry pages; OWASP ASVS 5 lists Encoding and Sanitization as V1. [CITED: https://cheatsheetseries.owasp.org/IndexASVS.html] [VERIFIED: apps/orchestrator-api/src/routes/admin.ts] |
| V2 Validation and Business Logic | yes | Keep label transition checks, duplicate active-run skips, pause/cost guards, and safe limit bounds behavior. [CITED: https://cheatsheetseries.owasp.org/IndexASVS.html] [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts] |
| V3 Web Frontend Security | yes | Server-rendered HTML must not introduce active controls or unsafe interpreted content. [CITED: https://cheatsheetseries.owasp.org/IndexASVS.html] [VERIFIED: docs/runbooks/mission-control.md] |
| V4 API and Web Service | yes | Preserve Hono route auth, HTTP status codes, HMAC validation, JSON shapes, and route exposure boundaries. [CITED: https://cheatsheetseries.owasp.org/IndexASVS.html] [VERIFIED: docs/runbooks/webhook-tailscale.md] |
| V6 Authentication | yes | Preserve `RUNNER_AUTH_TOKEN` bearer contract for protected routes and Plane/Linear webhook secrets for HMAC validation. [CITED: https://cheatsheetseries.owasp.org/IndexASVS.html] [VERIFIED: apps/orchestrator-api/src/routes/admin.ts] [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts] |

### Known Threat Patterns for Phase 5 Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Public admin/schedule/write route after helper extraction | Elevation of privilege | Shared middleware tests for 401 behavior on protected routes and no over-broad route registration. [VERIFIED: apps/orchestrator-api/src/routes/admin.test.ts] [VERIFIED: apps/orchestrator-api/src/routes/schedules.test.ts] |
| Invalid Plane webhook accepted after signature extraction | Spoofing / Tampering | Preserve `verifyPlaneSignature` production behavior and HMAC `timingSafeEqual` comparison. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts] |
| XSS in Mission Control or registry HTML | Tampering | Shared `escapeHtml` tests and malicious fixtures for renderers. [VERIFIED: apps/orchestrator-api/src/routes/registry.test.ts] |
| Duplicate or unauthorized run enqueue | Tampering / Repudiation | Preserve active-run dedupe, unique-violation handling, skip logging, pause, and cost guard checks. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts] |
| Resume/plan priority inversion | Denial of service | Preserve `JOB_PRIORITY.resume` lower numeric priority than `plan`. [VERIFIED: apps/orchestrator-api/src/queue.ts] [CITED: https://docs.bullmq.io/guide/jobs/prioritized] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md` - locked decisions, scope fences, recommended plan order. [VERIFIED: file read]
- `.planning/ROADMAP.md` - Phase 5 goal/success criteria and phase sequence. [VERIFIED: file read]
- `.planning/REQUIREMENTS.md` - REF-01, REF-02, VER-01 definitions. [VERIFIED: file read]
- `.planning/STATE.md` - Phase 4 complete and Phase 5 not started. [VERIFIED: file read]
- `apps/orchestrator-api/src/routes/admin.ts` and `.test.ts` - admin/Mission Control routes, rendering, and coverage. [VERIFIED: codebase grep]
- `apps/orchestrator-api/src/routes/webhooks.ts` and `.test.ts` - Plane/Linear webhook behavior and coverage. [VERIFIED: codebase grep]
- `apps/orchestrator-api/src/routes/registry.ts`, `agents.ts`, `schedules.ts`, `tools.ts` - duplicated helpers and auth patterns. [VERIFIED: codebase grep]
- `apps/orchestrator-api/src/cardWebhook.ts`, `runs.ts`, `queue.ts`, `missionScenarios.ts`, `missionTimeline.ts`, `artifacts.ts`, `routes/artifacts.ts` - supporting seams. [VERIFIED: codebase grep]
- Focused Vitest baseline - 10 files / 90 tests passed. [VERIFIED: focused vitest run]

### Secondary (MEDIUM confidence)

- Hono middleware docs - middleware registration, early return, execution order. [CITED: https://hono.dev/docs/guides/middleware]
- Hono bearer auth docs - official bearer middleware behavior and route/method scoping reference. [CITED: https://hono.dev/docs/middleware/builtin/bearer-auth]
- Hono testing docs - `app.request` route testing. [CITED: https://hono.dev/docs/guides/testing]
- Vitest mocking docs - `vi.mock`, `vi.spyOn`, `vi.mocked`, clearing mocks, and module mocking limits. [CITED: https://vitest.dev/guide/mocking] [CITED: https://vitest.dev/guide/mocking/modules]
- BullMQ prioritized jobs and architecture docs - priority option and lifecycle. [CITED: https://docs.bullmq.io/guide/jobs/prioritized] [CITED: https://docs.bullmq.io/guide/architecture]
- OWASP ASVS index - current ASVS category mapping. [CITED: https://cheatsheetseries.owasp.org/IndexASVS.html]

### Tertiary (LOW confidence)

- None used for recommendations. [VERIFIED: sources audit]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH for existing package/tool versions from local files and npm view checks; no package install recommended. [VERIFIED: package.json] [VERIFIED: npm view]
- Architecture: HIGH for codebase seams and route boundaries. [VERIFIED: codebase grep]
- Pitfalls: HIGH for codebase-specific regressions; MEDIUM where supported by external docs fetched via WebSearch instead of Context7. [VERIFIED: focused vitest run] [CITED: https://vitest.dev/guide/mocking/modules]

**Research date:** 2026-07-02 [VERIFIED: current_date]
**Valid until:** 2026-08-01 for codebase-local refactor boundaries; re-check npm/docs before dependency upgrades because latest package releases are moving quickly. [VERIFIED: npm view]
