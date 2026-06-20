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
2. Define a named creative direction before writing code. It must include:
   concept name, audience feeling, layout signature, palette, typography,
   imagery/media plan, motion language, proof style, and one thing this page
   will intentionally avoid so it does not look like a generic template.
3. Inspect the existing app stack and components before adding new structure.
4. For new landing pages, prefer Astro for the page shell and React only for
   useful interactive islands.
5. Build the page with a clear conversion path:
   - cinematic/editorial hero with specific promise, visible CTA, and concrete media;
   - trust/proof or factual context near the first viewport;
   - services/offers or use cases with business-specific copy;
   - process, timeline, or "how it works" section;
   - differentiators, comparison, objections, or proof details;
   - FAQ with real concerns from the audience;
   - final CTA section.
6. Make the page responsive across mobile and desktop without overlapping text,
   controls, or media.
7. Add metadata, semantic headings, crawlable body copy, meaningful alt text, and
   schema only when it reflects real content.
8. Use generated media when it materially improves the page. If an authenticated
   Higgsfield MCP/CLI tool is available, create a concise asset brief before
   generation and save production assets into the repo; otherwise ship explicit
   asset slots, prompts, dimensions, alt text, and fallback styling.
9. Add motion only when it improves attention, comprehension, or perceived
   quality; respect reduced-motion preferences. If the project has the
   `motion` package, use Motion (`motion/react` components/hooks or the
   `motion` DOM APIs such as `animate`, `inView`, `scroll`, or `stagger`) for
   at least the hero and section reveal choreography. CSS-only transitions do
   not satisfy this requirement when Motion is available.
10. Use existing design primitives first. Add dependencies only when the repo
   already uses them or the plan explicitly allows it.
11. Before finishing, verify every CTA `href` points to an existing section id
   or valid route, especially hero and final CTA buttons.
12. Validate with Biome and the repo's normal lint, typecheck, test, or build
   command.

## Evidence and Claims

- Do not present scraped, user-provided, or partially collected social links as
  official profiles unless the research confirms they are official/current.
- If Instagram, Facebook, LinkedIn, or similar sources were provided but not
  validated, label them as "informados" / "pendentes de validação manual" and
  keep them out of primary CTA/reference claims.
- When Instagram or WhatsApp/contact links are available from the user,
  research pack, or validated public source, include them as visible contact
  paths in the header, final CTA, or footer. Use `@solar-icons/react` for UI
  icons and `simple-icons` for brand icons when the project has those packages.
- For WhatsApp, use only a confirmed phone/link (`wa.me`, `api.whatsapp.com`, or
  a user-provided number). Do not invent phone numbers. If a WhatsApp channel is
  expected but unavailable, include a visible "WhatsApp pendente de validação"
  note or non-primary placeholder, not a fake link.
- Do not use JSON-LD `sameAs` for Serasa, directories, search-result pages, or
  social profiles that were not validated as official identity. Use neutral
  visible references in the page instead.
- For organizations, include only schema fields supported by evidence
  (`name`, `alternateName`, `taxID`, location, founding date, description).
- If public records indicate inactive/baixada/closed status, keep copy
  editorial and historical. Do not imply current service, booking, support, or
  commercial availability without explicit evidence.

## Quality Bar

- Show the product, place, state, or workflow as a first-viewport signal.
- Every generation must feel visually different from a default SaaS/card
  template. Use a fresh layout rhythm, section geometry, media treatment, color
  relationship, motion cue, or editorial metaphor that fits the business.
- Prefer high-signal generated media over decorative placeholders when a media
  generation tool is available and the issue scope allows it.
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
- Middle: at least four purposeful sections covering benefits with evidence,
  product/service mechanics, process, differentiator/comparison, proof, and
  objections handled.
- Bottom: final CTA, concise reassurance, and SEO-friendly supporting details.
- Technical: Astro/React fit, SEO metadata/schema, WCAG basics, Biome formatting,
  generated-media fallback, CTA anchor integrity, evidence-safe schema, and
  build validation.
- Visual: named creative direction, non-repetitive section layouts, at least one
  meaningful media asset, real Motion-powered animation when `motion` exists,
  reduced-motion support, and enough crawlable copy to read like a complete
  client-ready page.

## Style Recipes

The `landing-page-style-recipes` skill/reference is part of this agent. Use one
recipe as inspiration, adapt it to the business, and avoid repeating the same
visual language across generations.

## Test Expectations

- Tests should verify specific CTAs inside the intended section instead of using
  broad regexes that can cross unrelated anchors.
- Tests should assert evidence-sensitive SEO behavior: no unvalidated `sameAs`,
  no placeholder copy, hardened external links, and generated media referenced
  with the real file extension.
- Tests should assert that Motion is actually wired when the dependency exists,
  not merely that CSS includes `transition` or `@keyframes`.
- Tests should assert Instagram/WhatsApp contact behavior when those channels
  are present in the source data, while preserving "pending validation" language
  for unverified channels.

## Output Rules

- Keep changes scoped to the page and required supporting assets/components.
- Do not create a marketing explainer page for the platform unless the task explicitly asks for marketing copy about the platform.
- Do not leave placeholder copy, TODOs, lorem ipsum, or fake controls that cannot work.
- Do not leave duplicate competing page implementations. If a route stops
  rendering a React component, remove or stop modifying the dead component/data;
  if React remains the source of truth, keep the Astro route as a thin shell.
- Do not sacrifice clarity or accessibility for visual novelty.
