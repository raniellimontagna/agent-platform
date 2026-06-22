# Apify Instagram Provider Design

Date: 2026-06-22

## Goal

Add Apify as an optional external Instagram research provider for
`data-collector-agent`, using the existing Apify Instagram actor
`shu8hvrXbJbY3Eb9W` when a card includes Instagram handles such as
`@cameraecarburador`.

The provider should enrich research packs with structured public Instagram data
when Firecrawl does not support `instagram.com` and Instagram Graph API is not
available.

## Non-Goals

- Do not reimplement Apify's scraping, proxy, anti-blocking, or browser strategy
  inside this repository.
- Do not bypass login, captchas, rate limits, platform controls, paywalls, or
  private content.
- Do not publish, like, follow, message, comment, delete, hide, or moderate
  Instagram content.
- Do not require Apify for non-Instagram research.

## Runtime Configuration

- `APIFY_TOKEN`: optional secret. When absent, Apify is skipped and the existing
  Graph API, Firecrawl, and Playwright paths continue.
- `APIFY_INSTAGRAM_ACTOR_ID`: default `shu8hvrXbJbY3Eb9W`.
- `APIFY_BASE_URL`: default `https://api.apify.com`.
- `APIFY_INSTAGRAM_MAX_ITEMS`: default `20`.
- `APIFY_TIMEOUT_MS`: default `300000`.

Secrets must never be printed, committed, stored in research packs, or included
in command stderr/stdout.

## Architecture

Create `apps/worker-code/src/executor/apifyInstagramResearch.ts`.

Responsibilities:

- accept already-normalized Instagram handles;
- call Apify's synchronous Actor endpoint:
  `/v2/acts/{actorId}/run-sync-get-dataset-items`;
- pass a narrow input with profile URLs and item limits;
- normalize returned dataset items into a small internal shape;
- expose a formatter that produces an `## Apify Instagram Findings` markdown
  section;
- convert Apify errors into limitations instead of crashing the whole job;
- redact exact configured tokens and token-like values from persisted output.

Wire this module into `runFirecrawlResearchJob` after Instagram Graph API and
before Firecrawl output formatting. A successful Apify finding counts as usable
research, so a data-collector job can succeed when Apify returns data even if
Firecrawl rejects `instagram.com`.

## Data Flow

1. The collector extracts handles from title, description, and approved plan.
2. Instagram Graph API runs if configured.
3. Apify runs if `APIFY_TOKEN` is configured and at least one handle exists.
4. Firecrawl still runs against explicit/inferred public URLs when configured.
5. The research pack includes separate sections for Graph API, Apify, and public
   Firecrawl/Playwright findings.

## Research Pack Format

Apify results should appear as:

```markdown
## Apify Instagram Findings

### Sources
- AP1: @cameraecarburador via Apify actor shu8hvrXbJbY3Eb9W

### Profiles / Posts
- @cameraecarburador: name, bio, followers, posts, verified flag, profile URL
- AP1-M1: post URL, caption excerpt, timestamp, likes/comments when present

### Limitations
- Data was collected through Apify as an external provider for public Instagram
  research.
- No login bypass, engagement actions, DMs, private analytics, or hidden content
  were requested by agent-platform.
```

## Testing

Add tests for:

- missing `APIFY_TOKEN` skips Apify and records a limitation;
- successful Apify response produces normalized findings and markdown;
- Apify API error becomes a limitation, not a thrown job failure;
- exact token is redacted from stored errors, commands, and research;
- `runFirecrawlResearchJob` succeeds when Apify returns usable data and Firecrawl
  fails for Instagram;
- env defaults and `.env.example` entries exist.

## References

- Apify tutorial for running Actors and retrieving dataset data:
  https://docs.apify.com/academy/api/run-actor-and-retrieve-data-via-api
- Apify synchronous Actor dataset endpoint:
  https://docs.apify.com/api/v2/act-run-sync-get-dataset-items-post
