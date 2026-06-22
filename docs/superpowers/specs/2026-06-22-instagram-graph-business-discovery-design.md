# Instagram Graph Business Discovery Design

Date: 2026-06-22

## Goal

Add an official Instagram Graph API path for `data-collector-agent` research
packs when a Plane card includes Instagram handles such as
`@cameraecarburador`.

The integration is for public research. It should use our authorized Instagram
professional account to query public Business/Creator profile data through
Business Discovery, then fall back to the existing public Firecrawl/Playwright
collection when Graph API cannot return data.

## Non-Goals

- Do not collect private analytics, DMs, follower lists, audience demographics,
  or account insights for third-party profiles.
- Do not automate login, bypass platform controls, scrape behind authentication,
  or simulate user engagement.
- Do not require each researched profile to connect their account in this phase.
- Do not publish, comment, follow, like, message, hide, or delete Instagram
  content.

## External API Contract

Use Meta's Instagram API with Facebook Login Business Discovery capability.
Official docs state that Business Discovery can return basic metadata and
metrics for other Instagram professional accounts, and the IG User reference
describes it as data for other Business or Creator IG users.

Required runtime configuration:

- `INSTAGRAM_GRAPH_ACCESS_TOKEN`: long-lived access token for our authorized
  Meta app/account.
- `INSTAGRAM_GRAPH_IG_USER_ID`: IG user ID for our authorized professional
  account used as the Business Discovery query root.
- `INSTAGRAM_GRAPH_BASE_URL`: default `https://graph.facebook.com`.
- `INSTAGRAM_GRAPH_API_VERSION`: configured version string such as the current
  production Graph API version; keep it explicit so upgrades are deliberate.
- `INSTAGRAM_GRAPH_TIMEOUT_MS`: request timeout, default `30000`.

The exact requested fields should stay conservative:

- `id`
- `username`
- `name`
- `biography`
- `website`
- `followers_count`
- `media_count`
- recent `media` fields when available:
  - `id`
  - `caption`
  - `media_type`
  - `media_url`
  - `permalink`
  - `timestamp`
  - `like_count`
  - `comments_count`

## Architecture

Add a focused worker module:

- `apps/worker-code/src/executor/instagramGraphResearch.ts`

Responsibilities:

- normalize handles already extracted by `extractInstagramHandles`;
- build a Business Discovery request for each handle;
- parse and validate Meta responses with `zod`;
- return structured research sources plus command audit entries;
- convert API errors into explicit research limitations instead of failing the
  whole data-collector run.

Do not merge this logic into `firecrawlResearch.ts` beyond orchestration. The
Graph API path has different authentication, error shapes, rate limits, and data
semantics from public scraping.

## Data Flow

1. `data-collector-agent` receives a card with one or more Instagram handles.
2. `runJob` chooses the data collector path.
3. The collector extracts handles from title, description, and approved plan.
4. If Graph API envs are configured, run Business Discovery for those handles.
5. Run existing Firecrawl/Playwright public collection as the complementary
   fallback/source path.
6. Build one research artifact that clearly separates:
   - `Instagram Graph API Findings`;
   - `Instagram Public Findings`;
   - source IDs;
   - observed facts;
   - inferred notes;
   - limitations.

If Graph API is not configured, the run should not fail only because the Graph
API is absent. It should continue with public collection and include a limitation
explaining that Business Discovery was skipped.

## Error Handling

Graph API failures should be bounded and visible:

- invalid/missing token: record configuration limitation;
- permission or app-review issue: record authorization limitation;
- profile not Business/Creator or unavailable: record target limitation;
- 429/rate limit: record rate-limit limitation and avoid retry storms;
- malformed response: record parse limitation with a redacted summary.

Only fail the data-collector run when all configured collection paths fail to
produce any usable research source.

## Research Pack Format

Add a section before the general limitations:

```markdown
## Instagram Graph API Findings

### Sources
- IG1: @cameraecarburador via Instagram Graph API Business Discovery

### Profile
- Username: cameraecarburador
- Name: value returned by Business Discovery, when present
- Bio: value returned by Business Discovery, when present
- Website: value returned by Business Discovery, when present
- Followers: numeric public follower count, when present
- Media count: numeric public media count, when present

### Recent Media
- IG1-M1: permalink, timestamp, media type, caption excerpt, public like count,
  and public comments count when present

### Limitations
- Business Discovery only returns supported public fields for Business/Creator
  accounts.
- No private analytics, DMs, follower lists, demographics, or hidden content were
  requested.
```

Continue to include the existing `Instagram Findings` section for public
Firecrawl/Playwright results.

## Testing

Add focused tests for:

- Business Discovery URL construction and field selection.
- Successful response normalization for one handle.
- API error response becoming a limitation, not a job crash.
- Missing envs skipping Graph API and preserving Firecrawl behavior.
- Combined research pack containing Graph API findings plus public fallback.
- No token value appears in command output, research artifact, or errors.

Run at minimum:

- `rtk corepack pnpm vitest run apps/worker-code/src/executor/instagramGraphResearch.test.ts apps/worker-code/src/executor/firecrawlResearch.test.ts apps/worker-code/src/executor/runJob.test.ts`
- `rtk corepack pnpm lint`
- `rtk corepack pnpm --filter @agent-platform/worker-code build`
- `rtk corepack pnpm test`

## Rollout

1. Ship code with envs optional.
2. Deploy without Graph API token first; confirm public research still works.
3. Add Meta app token and IG user ID to runner env.
4. Test with a known Business/Creator handle, such as `@cameraecarburador` if it
   is eligible.
5. Monitor research artifacts for explicit limitations and no leaked secrets.

## References

- Meta Instagram Platform overview:
  https://developers.facebook.com/docs/instagram-platform/overview/
- Meta Business Discovery:
  https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery/
- Meta IG User Business Discovery reference:
  https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery/
