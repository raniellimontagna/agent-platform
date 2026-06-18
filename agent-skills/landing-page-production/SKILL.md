---
name: landing-page-production
description: Build exceptional, conversion-focused landing pages quickly by composing visual design, UX clarity, accessibility, SEO, Astro + React implementation, Biome validation, and tasteful motion. Use when an agent is asked to create or improve a landing page, product page, lead generation page, waitlist page, launch page, SaaS homepage, or campaign page.
---

# Landing Page Production

Deliver a visually strong, clear, accessible, SEO-aware first-screen experience,
not instructions about how to build one. Treat this skill as the orchestrator for
the landing-page skill bundle.

## Workflow

1. Identify the audience, offer, primary CTA, and expected conversion.
2. Define the page's visual direction before writing code: product category,
   mood, palette, typography, imagery, motion level, and proof style.
3. Inspect the existing app stack and components before adding new structure.
4. For new landing pages, prefer Astro for the page shell and React only for
   useful interactive islands.
5. Build the page with a clear conversion path:
   - hero with specific promise and visible CTA;
   - credibility/proof or concrete product evidence;
   - benefits tied to outcomes, not generic feature labels;
   - friction reducers such as FAQ, guarantee, comparison, or social proof when useful;
   - final CTA section.
6. Make the page responsive across mobile and desktop without overlapping text,
   controls, or media.
7. Add metadata, semantic headings, crawlable body copy, meaningful alt text, and
   schema only when it reflects real content.
8. Add motion only when it improves attention, comprehension, or perceived
   quality; respect reduced-motion preferences.
9. Use existing design primitives first. Add dependencies only when the repo
   already uses them or the plan explicitly allows it.
10. Validate with Biome and the repo's normal lint, typecheck, test, or build
   command.

## Quality Bar

- Show the product, place, state, or workflow as a first-viewport signal.
- Use precise copy. Avoid "transform your business", "unlock potential", and other filler.
- Prefer one memorable composition over many decorative cards.
- Avoid one-hue palettes, generic gradients, decorative blobs, and stock-like empty visuals.
- Give repeated sections stable responsive dimensions so hover, loading, and long text states do not shift layout.
- Include accessible labels, semantic structure, visible focus, keyboard paths,
  contrast, target sizing, and reduced-motion handling where the stack supports them.
- Keep the conversion path understandable without relying on animation, hover,
  color alone, or hidden client state.
- Make every section earn its space: clarify the offer, increase trust, reduce
  friction, show proof, or move the user toward the CTA.
- Ensure the page still works when images are slow, copy is longer than expected,
  and viewport width is narrow.

## Composition Checklist

- Above the fold: clear promise, concrete supporting copy, primary CTA, visual
  signal, and trust/proof hint.
- Middle: benefits with evidence, product/service mechanics, comparison or
  differentiator, and objections handled.
- Bottom: final CTA, concise reassurance, and SEO-friendly supporting details.
- Technical: Astro/React fit, SEO metadata/schema, WCAG basics, Biome formatting,
  and build validation.

## Output Rules

- Keep changes scoped to the page and required supporting assets/components.
- Do not create a marketing explainer page for the platform unless the task explicitly asks for marketing copy about the platform.
- Do not leave placeholder copy, TODOs, lorem ipsum, or fake controls that cannot work.
- Do not sacrifice clarity or accessibility for visual novelty.
