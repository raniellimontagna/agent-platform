---
name: research-data-collection
description: Collect, normalize, and summarize public web data for downstream agents. Use when researching markets, competitors, products, pricing, positioning, SEO content, source evidence, or customer language using search, HTTP extraction, Firecrawl, Playwright, Scrapling, or other scraping tools.
---

# Research Data Collection

Collect useful evidence, not raw dumps. The output should help another agent make
better decisions, especially `landing-page-agent`.

## Safety Policy

1. Prefer public pages and official APIs.
2. Check robots.txt, site terms, and task scope before crawling.
3. Do not bypass paywalls, login walls, captchas, or access controls.
4. Do not collect sensitive personal data unless the user explicitly provides a
   lawful scope and the repo has a policy for handling it.
5. Rate-limit requests and keep crawls narrow.
6. Record source URLs, timestamps, extraction method, and confidence.
7. Separate facts from inferences.

## Tool Selection

- Use search/manual source lists first when the research question is broad.
- Use Firecrawl for public pages where markdown extraction is enough.
- Use HTTP fetch/Scrapling `Fetcher` for static pages and APIs.
- Use Playwright or Scrapling dynamic fetchers for JS-rendered pages.
- Use Scrapling spider/crawling only for bounded multi-page extraction.
- Avoid stealth/anti-bot modes by default; use them only for legitimate research
  where ToS allows automated access and a human has approved the risk.

## Output Contract

Return a compact research pack with:

- objective and scope;
- sources with URL, title, date accessed, method, and relevance;
- extracted facts with citations/source IDs;
- competitor claims, offers, pricing, proof, objections, and audience language
  when relevant;
- contact and conversion channels when relevant, especially official website,
  Instagram, WhatsApp, phone, email, maps/location, booking links, and whether
  each channel is validated, user-provided, inferred, inaccessible, or pending
  manual confirmation;
- SEO terms/entities and content gaps when relevant;
- screenshots or artifacts when dynamic/visual evidence matters;
- limitations, inaccessible sources, and confidence;
- recommended next actions for the downstream agent.

## Landing Page Research

When supporting LP generation, prioritize:

- audience pains and desired outcomes;
- exact product/service positioning;
- proof points, testimonials, case studies, integrations, metrics, and pricing;
- competitor differentiation;
- Instagram profile, WhatsApp/contact link, phone, email, map/location, and
  booking/contact channels. Mark each as validated, informed by the user,
  inferred, inaccessible, or pending manual confirmation. Never invent a
  WhatsApp number;
- search terms, entity language, FAQs, objections, and comparison angles;
- visual references that clarify product category and trust expectations.
