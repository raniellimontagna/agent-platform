# Research Landing Briefing Design

## Context

`workflow:landing-page` already chains `data-collector-agent` into
`landing-page-agent`: the collector returns a Markdown `research` artifact and
the orchestrator injects that artifact into the second run as planner context.
After adding Apify Instagram, the artifact contains better evidence for public
Instagram profiles, but the downstream landing agent still receives a broad
research pack rather than a predictable conversion brief.

## Goal

Generate a structured landing/page briefing from the research pack and place it
where the `landing-page-agent` can consume it deterministically.

## Recommended Approach

Use a deterministic Markdown section inside the existing `research` artifact:
`## Landing Page Brief`. The section summarizes audience, offer, evidence,
copy angles, content blocks, SEO terms, visual direction, CTAs, risks, and source
usage. The orchestrator then moves this section to the top of the
research-to-landing context while still appending the full research pack below.

This avoids a database migration for a new artifact kind, keeps the current
workflow compatible, and gives the downstream agent a stable structure without
requiring another LLM call.

## Alternatives Considered

1. Add a new `landing_brief` artifact kind.
   This gives a clean storage boundary but requires a DB enum migration and
   orchestration changes for little immediate gain.

2. Generate the brief with a second LLM call.
   This may produce richer copy, but it adds cost, latency, and another failure
   mode. A deterministic brief is enough for the next workflow step.

3. Keep only the raw research pack.
   This is already working, but it leaves too much interpretation to the landing
   planner and increases the chance of generic pages.

## Behavior

- `data-collector-agent` adds `## Landing Page Brief` before provider-specific
  findings.
- The brief is generated from available research text and known collected
  handles/URLs. It separates facts from inferred recommendations.
- Missing data is stated as a gap; no prices, testimonials, contacts, or private
  metrics are invented.
- Apify/Graph/Firecrawl limitations remain in the pack and are reflected as
  validation cautions in the brief.
- `formatResearchToLandingContext()` extracts the brief and puts it first in the
  continuation context for `landing-page-agent`.
- The full research pack remains included after the brief for traceability.

## Output Contract

The brief section contains these subsections:

- `### Brand / Subject`
- `### Audience Hypotheses`
- `### Offer And Conversion Angle`
- `### Evidence To Reuse`
- `### Recommended Page Structure`
- `### SEO And Content Terms`
- `### Visual Direction`
- `### Calls To Action`
- `### Risks / Gaps`
- `### Source Handling`

## Testing

- Worker tests verify that Firecrawl and Apify research output includes a
  structured brief and does not leak configured secrets.
- Workflow tests verify that the landing continuation context promotes the brief
  before the full research pack.
- Smoke test runs `data-collector-agent` against `@cameraecarburador` with the
  Apify token from ignored `.env` and confirms the brief, research pack, handle,
  Apify findings, and token redaction.

## Non-Goals

- No scraping bypass, login automation, DMs, private analytics, or hidden
  content collection.
- No DB migration in this iteration.
- No new arbitrary workflow builder UI.
