# Historical Documentation Index

**Last reviewed:** 2026-07-02

These files are retained for evidence and context. They may describe how the
project was built, not how it should be operated today.

## Historical Planning Records

`docs/superpowers/plans/` and `docs/superpowers/specs/` contain 46 dated build
artifacts from the earlier implementation phase:

- 23 implementation plans.
- 23 design/spec documents.

Use them to understand why a feature exists or to recover implementation
details. Do not treat them as current source of truth without checking
`docs/CURRENT.md` and `docs/ARCHITECTURE.md`.

## Milestone Governance Records

- `.planning/phases/07-final-verification-and-governance-closeout/07-MILESTONE-AUDIT.md`
  is the final cleanup milestone audit for VER-04. It names removed legacy,
  accepted gaps, remaining debt, and next cleanup candidates with source
  evidence.
- `.planning/phases/07-final-verification-and-governance-closeout/07-FINAL-GATE-EVIDENCE.md`
  records the final VER-02 full gate and VER-03 eval regression evidence.

These records are historical governance evidence. Use them to understand the
cleanup milestone closeout, then return to `docs/CURRENT.md` and active runbooks
for current operating guidance.

## Migration Records

- `docs/runbooks/plane-migration-2026-06-20.md` — one-time Linear-to-Plane
  migration record and verification notes.
- `docs/superpowers/plans/2026-06-20-card-providers-plane.md` and matching spec
  — historical implementation plan for provider-aware Plane support.

## Legacy Linear-First Context

- `docs/decisions/ADR-0005-linear-github-agent-workflow.md` records the
  Linear-first workflow that preceded Plane-first operation.
- Linear-specific references in old runbooks/specs should be interpreted as
  historical unless the current docs explicitly mark them as legacy support.

## Historical E2E Notes

- `docs/runbooks/auto-merge-e2e-final.md`
- `docs/runbooks/auto-merge-opt-in-post-deploy-20260616.md`
- Older MAC-prefixed Superpowers plans/specs

These are useful as validation records. Prefer current runbooks for repeating
operations.

## Archive Policy

Before deleting, moving, or rewriting historical docs:

1. Confirm no current runbook links to the file as active guidance.
2. Preserve migration/audit evidence somewhere searchable.
3. Mention the removal in `.planning/STATE.md` or the relevant phase summary.
4. Run docs/link verification if a link checker is added later.

## Source Owner Rule

Historical records can explain why labels, agents, models, or artifacts were
introduced, but they are not the current owner for mutable values. Use
`docs/README.md` and `docs/CURRENT.md` to find the active source owner before
following any old Linear-first, dated Plane migration, or Superpowers guidance.
