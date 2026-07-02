# Phase 2: Living Documentation and Historical Archive - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning
**Mode:** Autonomous smart discuss using Phase 1 inventory

<domain>
## Phase Boundary

Make documentation usable again by separating current operational docs from
historical planning artifacts and updating entry points to reflect the current
Plane-first architecture. This phase does not delete historical records; it
creates clear indexes and status labels so maintainers know what to trust today.

</domain>

<decisions>
## Implementation Decisions

### Documentation Structure
- Add a top-level `docs/README.md` as the canonical documentation map.
- Add `docs/CURRENT.md` for current operator/architecture references.
- Add `docs/HISTORICAL.md` for historical specs, implementation plans, and
  migration records.
- Add local README files in `docs/runbooks` and `docs/superpowers` to make
  their status obvious.

### Historical Preservation
- Do not delete or bulk-move `docs/superpowers/**` in this phase.
- Mark `docs/superpowers/**` as historical planning evidence.
- Mark Linear-first ADR/runbook material as historical or legacy where needed.

### Current Flow Naming
- Plane is the current operational provider.
- Linear is legacy optional/migration context.
- `software-delivery-pipeline` is the clear role identity; `coder-agent`
  remains compatibility key until Phase 4/3 proves it can be narrowed.

### the agent's Discretion
The agent may keep README edits compact and avoid rewriting long historical
sections if the new documentation map clearly routes maintainers to current
sources of truth.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 1 inventory and risk matrix are the authoritative baseline.
- `README.md` already has concise architecture and runbook pointers.
- `docs/ARCHITECTURE.md` is still useful, but includes historical card/phase
  language that should be framed as current-state architecture plus history.

### Established Patterns
- Project docs are in Portuguese with some English operational notes.
- Runbooks are mostly task-oriented.
- `docs/superpowers` files are dated and card/phase-specific.

### Integration Points
- Root `README.md` should point to `docs/README.md`.
- `docs/ARCHITECTURE.md` should point to the new current/historical map.
- `docs/runbooks/README.md` should orient operators by task.
- `docs/superpowers/README.md` should prevent historical plans from competing
  with living docs.

</code_context>

<specifics>
## Specific Ideas

- Treat Phase 2 as documentation governance, not runtime refactor.
- Prefer status labels: current, legacy, historical, migration record.
- Leave destructive archive/deletion decisions for later explicit cleanup.

</specifics>

<deferred>
## Deferred Ideas

- Moving files into archive directories is deferred until maintainers have
  reviewed the indexes.
- Removing Linear docs is deferred until Phase 3 provider cutover.
- Rewriting all old docs is out of scope; index and status are enough for this
  phase.

</deferred>

