---
name: seo-page
description: Optimize landing pages for SEO, including technical SEO, on-page metadata, schema, sitemap readiness, content quality, image optimization, AI search readiness, and Generative Engine Optimization. Use when creating or improving landing pages, campaign pages, product pages, SaaS homepages, and SEO-focused pages.
---

# SEO Page

Treat SEO as part of the landing page implementation, not a post-build checklist.

## Page Requirements

- Include a specific title, meta description, canonical URL strategy, and Open Graph/Twitter metadata when the stack supports it.
- Use one clear `h1` and a logical heading hierarchy.
- Make core content crawlable in HTML; do not hide essential copy behind client-only state.
- Add product/service-specific copy with concrete terms users would search for.
- Include descriptive alt text for meaningful images.
- Keep internal links and CTA destinations understandable.
- Prefer fast static rendering for landing pages.

## Schema And Discovery

- Add Schema.org JSON-LD only when it matches real page content.
- Prefer `Organization`, `WebSite`, `Product`, `SoftwareApplication`, `Service`, `FAQPage`, or `BreadcrumbList` when appropriate.
- Do not add deprecated or misleading schema.
- Ensure sitemap/robots conventions are preserved if the repo already has them.
- Consider AI search/GEO by making claims, product entities, pricing/positioning, and proof easy to quote and attribute.

## Quality Gates

- Avoid thin pages: every section should add useful information or conversion value.
- Avoid duplicate title/meta copy across generated pages.
- Do not keyword-stuff headings, alt text, or body copy.
- Keep Core Web Vitals in mind: reduce heavy client JavaScript, avoid layout shift, and size media responsibly.
- Validate with available build/lint tooling and inspect generated HTML when possible.
