---
name: astro-react-landing
description: Build landing pages with Astro plus React. Use when creating a landing page from scratch, migrating a landing page, or adding interactive islands/components where the preferred stack is Astro pages/layouts with React components.
---

# Astro React Landing

Use Astro as the page and content framework. Use React for interactive islands,
stateful UI, forms, calculators, carousels, dashboards, and reusable components.

## Stack Contract

- Prefer `.astro` routes, layouts, and static content for the landing page shell.
- Prefer React components only where interactivity or component state is useful.
- Keep static sections server-rendered by Astro when possible.
- Use Astro image/content primitives when the repo already uses them.
- Avoid shipping client JavaScript for sections that can be static HTML/CSS.
- Keep route, layout, and component names clear and product-specific.

## Implementation Pattern

1. Inspect the existing Astro structure before creating files.
2. Create or update the landing route in `src/pages/`.
3. Use shared layouts/components from `src/layouts/` and `src/components/` when present.
4. Place interactive React components near existing component conventions.
5. Hydrate React islands intentionally with Astro client directives only when needed.
6. Keep metadata, canonical URL, Open Graph, and structured content close to the page/layout.
7. Validate with the repo's Astro, TypeScript, Biome, test, or build command.

## Quality Rules

- Do not turn every section into React by default.
- Do not add Astro or React dependencies if the repo already has an app stack and the task does not allow migration.
- Prefer static generation for landing pages unless the product needs request-time data.
- Keep above-the-fold content fast, semantic, and crawlable.
- Ensure forms and CTAs remain usable without fragile animation timing.
