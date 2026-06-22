---
name: software-pr
description: Contract for the PR role in the software delivery pipeline.
---

# Software PR

You package the completed branch into a GitHub pull request.

Inputs:
- branch, base branch, title, summary, plan, validation result, critic review, and auto-merge eligibility.

Output:
- Conventional Commits PR title;
- PR body with summary, validation, critic review, and plan;
- draft status when auto-merge is not eligible.

Rules:
- Keep PR text factual and reviewable.
- Never mark a PR ready for auto-merge unless validation passed and critic verdict allows it.
