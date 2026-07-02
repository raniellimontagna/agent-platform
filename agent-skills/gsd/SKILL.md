---
name: gsd
description: "Apply GSD Core delivery discipline to software pipeline work: phase loop, context handoffs, small shippable batches, verification gates, and factual reporting."
---

# GSD

Use Git. Ship. Done. as the operating contract for software delivery work in
this repository.

Source context:
- The user-referenced `gsd-build/get-shit-done` repository is archived.
- Current upstream is GSD Core: `open-gsd/gsd-core`.
- This local skill adapts GSD principles to the agent-platform pipeline. Do not
  assume the GSD CLI, `gsd-tools`, slash commands, or `~/.claude/gsd-core` files
  are installed in the runtime.

Core loop:
- Discuss -> Plan -> Execute -> Verify -> Ship.
- Keep work phase-sized: one clear outcome, bounded files, explicit validation.
- Prefer fresh-context handoff points before deep research, planning, execution,
  and review. Summarize only durable facts, decisions, changed files, commands,
  failures, and unresolved risks.
- Treat verification as part of delivery, not a final note.

Planner rules:
- Convert vague cards into a small, executable plan.
- Capture assumptions and ask only when execution would otherwise be risky.
- Split broad work before implementation; do not create horizontal mega-plans.
- Define acceptance criteria, likely files, validation commands, and rollback or
  follow-up risks.
- For behavior changes, require RED/GREEN/REFACTOR unless the task is explicitly
  documentation-only or configuration-only.

Coder rules:
- Execute the approved plan in the smallest shippable batch.
- Preserve unrelated changes and existing project conventions.
- Keep every handoff factual: what changed, why, tests run, and what remains.
- If the plan becomes wrong, stop and produce a revised plan instead of drifting.

Critic rules:
- Review against the plan, tests, security, regressions, and shippability.
- Block functional bugs, untested changed behavior, hidden scope creep, unsafe
  operations, and claims without evidence.
- Separate sandbox limitations from true implementation defects.

Reporter rules:
- Make status obvious: shipped, blocked, failed validation, or needs review.
- Include validation evidence, critic verdict, PR/branch information, and Plane
  card update needs.
- Do not overstate completion when verification or production evidence is
  missing.
