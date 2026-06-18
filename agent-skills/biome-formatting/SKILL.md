---
name: biome-formatting
description: Use Biome for formatting and linting in JavaScript, TypeScript, Astro, React, JSON, and CSS projects. Use when the repository has biome.json, Biome scripts, or tasks that require code style, import organization, lint fixes, or formatting validation.
---

# Biome Formatting

Use the repository's Biome configuration as the source of truth for formatting,
linting, import organization, and safe automatic fixes.

## Workflow

1. Check `package.json` scripts and `biome.json` before choosing commands.
2. Prefer the repo script, such as `rtk corepack pnpm lint`, `rtk corepack pnpm lint:fix`, or `rtk corepack pnpm verify`.
3. Use automatic writes only for formatting/import organization and safe lint fixes.
4. Re-run validation after automatic fixes.
5. Keep unrelated files out of the commit unless the formatter intentionally touched them.

## Implementation Rules

- Let Biome decide quote style, semicolons, trailing commas, and import ordering.
- Do not hand-format against Biome output.
- Do not add ESLint/Prettier config when Biome is already the configured formatter/linter.
- Use JSON-aware edits for `biome.json`, `package.json`, and other config when possible.
- Treat generated Biome changes as mechanical; review semantic code separately.

## Agent Platform Defaults

- Use `rtk corepack pnpm lint:fix` for formatting/import ordering.
- Use `rtk corepack pnpm verify` before finishing repo changes.
- If `pnpm` is not directly in PATH, use `corepack pnpm`.
