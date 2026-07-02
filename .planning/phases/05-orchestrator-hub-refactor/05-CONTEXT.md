# Phase 5: Orchestrator Hub Refactor - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning
**Mode:** Autonomous smart-discuss defaults accepted by `--auto`

<domain>
## Phase Boundary

Phase 5 splits high-risk orchestrator API hubs into smaller, tested seams
without changing runtime behavior. The phase covers shared route/auth/render
helpers, Plane webhook intake/transition seams, and admin/Mission Control
rendering seams.

It must preserve the Plane-first behavior delivered in Phase 3 and the source
ownership contracts documented in Phase 4. This phase is not a UI redesign, a
provider migration, a worker/eval refactor, a schema migration, or a live deploy
change.
</domain>

<decisions>
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning And Requirements

- `.planning/ROADMAP.md` — Phase 5 scope, success criteria, and planned slices.
- `.planning/REQUIREMENTS.md` — REF-01, REF-02, and VER-01 requirements.
- `.planning/STATE.md` — current milestone state and prior decisions.
- `.planning/phases/04-operational-flow-reorganization/04-CONTEXT.md` —
  locked flow and source-of-truth decisions that Phase 5 must preserve.
- `.planning/phases/04-operational-flow-reorganization/04-01-SUMMARY.md` —
  active Plane-first flow and operational surface evidence.
- `.planning/phases/04-operational-flow-reorganization/04-02-SUMMARY.md` —
  source-owner map and registry compatibility guardrails.

### Current Docs

- `docs/CURRENT.md` — active operational surface/status map.
- `docs/ARCHITECTURE.md` — Plane-first topology and flow narrative.
- `docs/decisions/FLOW-agent-workflow.md` — delivery pipeline flow.
- `docs/runbooks/webhook-tailscale.md` — public webhook exposure and HMAC
  expectations.
- `docs/runbooks/mission-control.md` — Mission Control read-only operating
  contract.
- `docs/runbooks/scheduler.md` — scheduler ownership, relevant when touching
  route/auth helper reuse around scheduled/admin routes.

### Orchestrator Route Hubs

- `apps/orchestrator-api/src/routes/admin.ts` — admin and Mission Control route
  handlers, data assembly, and HTML rendering hub.
- `apps/orchestrator-api/src/routes/admin.test.ts` — characterization coverage
  for protected admin/Mission Control behavior.
- `apps/orchestrator-api/src/routes/webhooks.ts` — Plane/legacy Linear webhook
  intake, parsing, transitions, enqueue/resume/cancel behavior.
- `apps/orchestrator-api/src/routes/webhooks.test.ts` — characterization
  coverage for Plane and legacy webhook behavior.
- `apps/orchestrator-api/src/routes/registry.ts` — duplicated HTML/date helpers
  and registry rendering patterns.
- `apps/orchestrator-api/src/routes/agents.ts`,
  `apps/orchestrator-api/src/routes/schedules.ts`, and
  `apps/orchestrator-api/src/routes/tools.ts` — duplicated route auth pattern.

### Supporting Modules

- `apps/orchestrator-api/src/cardWebhook.ts` — existing label transition helper.
- `apps/orchestrator-api/src/workflows.ts` — workflow-label source owner.
- `apps/orchestrator-api/src/agents.ts` — agent-key source owner.
- `apps/orchestrator-api/src/runs.ts` — run persistence and transition helpers.
- `apps/orchestrator-api/src/queue.ts` — BullMQ job contract.
- `apps/orchestrator-api/src/artifacts.ts` and
  `apps/orchestrator-api/src/routes/artifacts.ts` — artifact ownership and
  route shape.
- `apps/orchestrator-api/src/missionScenarios.ts` and
  `apps/orchestrator-api/src/missionTimeline.ts` — Mission Control scenario and
  timeline data helpers.
- `packages/cards/src/index.ts` — existing safe HTML escaping for card comment
  markdown, useful as a safety reference but not necessarily the owner for
  route HTML.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `apps/orchestrator-api/src/cardWebhook.ts` already owns
  `labelJustAdded(...)`, which should remain the source for transition logic
  instead of duplicating new transition semantics in extracted webhook code.
- `apps/orchestrator-api/src/missionTimeline.ts` and
  `apps/orchestrator-api/src/missionScenarios.ts` already separate much of the
  Mission Control domain data from route rendering; Phase 5 should build on
  those seams.
- `packages/cards/src/index.ts` has a tested `escapeHtml` implementation used
  for Plane comment HTML conversion. Route HTML can either reuse a local helper
  with equivalent escaping or deliberately keep package boundaries clear.

### Established Patterns

- Route modules use Hono and small middleware functions. `routes/agents.ts`,
  `routes/schedules.ts`, and `routes/tools.ts` each define local bearer auth
  helpers matching the admin token pattern.
- Current tests exercise the route modules directly with Hono app instances.
  New characterization tests should follow the existing `*.test.ts` style and
  avoid live Plane/GitHub/Redis dependencies.
- Phase 3 and Phase 4 preserved compatibility seams while tightening active
  Plane defaults. Phase 5 should follow the same discipline.

### Integration Points

- `routes/webhooks.ts` is roughly 471 lines and mixes provider compatibility,
  Plane parsing, signature checks, skip logging, ai-ready enqueueing, approval
  resume, and cancellation.
- `routes/admin.ts` is roughly 649 lines and mixes auth, status endpoints,
  Mission Control data assembly, JSON route responses, and large HTML render
  functions.
- `routes/registry.ts` duplicates `escapeHtml` and `formatDate`, while other
  routes duplicate bearer-token middleware. These are the safest first seams.

</code_context>

<specifics>
## Specific Ideas

- Recommended plan order:
  1. Extract shared route/auth/render helpers with characterization tests.
  2. Refactor `routes/webhooks.ts` into Plane intake and run-transition seams.
  3. Refactor `routes/admin.ts`/Mission Control rendering into focused modules.
- Keep tests focused first, then run `rtk corepack pnpm verify` before closing
  Phase 5.
- If helper extraction touches multiple routes, prefer a small helper module and
  minimal import churn over a sweeping route reorganization.
</specifics>

<deferred>
## Deferred Ideas

- Mission Control product UI rewrite or typed frontend rendering system remains
  future work (`FUT-01`), not Phase 5.
- Worker/eval/codegen/data-collector refactors remain Phase 6.
- Destructive Linear schema cleanup still requires separate explicit
  confirmation and is not part of Phase 5.

</deferred>

---

*Phase: 05-Orchestrator Hub Refactor*
*Context gathered: 2026-07-02*
