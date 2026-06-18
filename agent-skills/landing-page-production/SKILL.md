---
name: landing-page-production
description: Build complete, conversion-focused landing pages quickly inside an existing web app. Use when an agent is asked to create or improve a landing page, product page, lead generation page, waitlist page, launch page, SaaS homepage, or campaign page.
---

# Landing Page Production

Deliver a real first-screen experience, not instructions about how to build one.

## Workflow

1. Identify the audience, offer, primary CTA, and expected conversion.
2. Inspect the existing app stack and components before adding new structure.
3. Build the page with a clear conversion path:
   - hero with specific promise and visible CTA;
   - credibility/proof or concrete product evidence;
   - benefits tied to outcomes, not generic feature labels;
   - friction reducers such as FAQ, guarantee, comparison, or social proof when useful;
   - final CTA section.
4. Make the page responsive across mobile and desktop without overlapping text or controls.
5. Use existing design primitives first. Add dependencies only when the repo already uses them or the plan explicitly allows it.
6. Keep the implementation ready to run in the current project and preserve unrelated code.

## Quality Bar

- Show the product, place, state, or workflow as a first-viewport signal.
- Use precise copy. Avoid "transform your business", "unlock potential", and other filler.
- Prefer one strong composition over many decorative cards.
- Avoid one-hue palettes, generic gradients, decorative blobs, and stock-like empty visuals.
- Give repeated sections stable responsive dimensions so hover, loading, and long text states do not shift layout.
- Include accessible labels, focus states, and semantic structure where the stack supports them.
- Validate with the repo's normal lint, typecheck, test, or build command.

## Output Rules

- Keep changes scoped to the page and required supporting assets/components.
- Do not create a marketing explainer page for the platform unless the task explicitly asks for marketing copy about the platform.
- Do not leave placeholder copy, TODOs, lorem ipsum, or fake controls that cannot work.
