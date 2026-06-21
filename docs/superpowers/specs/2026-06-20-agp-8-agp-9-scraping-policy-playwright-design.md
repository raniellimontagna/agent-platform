# AGP-8/AGP-9 Scraping Policy and Playwright Design

## Scope

Implement worker-side controls for `data-collector-agent` scraping jobs.
AGP-8 adds a dedicated scraping policy and URL allowlist. AGP-9 adds a
controlled Playwright path for dynamic collection and screenshots.

## Architecture

The existing shell `commandPolicy` remains responsible for sandbox command
allowlisting. A new scraping policy layer validates URLs and collection intent
before Firecrawl or Playwright runs. Both collectors consume the same authorized
URL list, so Firecrawl and Playwright have one shared security boundary.

Firecrawl remains the default collector. Playwright is selected only when the
card or plan explicitly asks for browser rendering, dynamic content, or
screenshots. Playwright is loaded dynamically so normal worker tests and
deployments fail clearly if the runtime dependency is missing.

## Policy Contract

- Only explicit `http` and `https` URLs from card title, description, or plan are
  allowed.
- Localhost, private IP ranges, link-local ranges, multicast, unspecified hosts,
  internal-looking hostnames, and cloud metadata endpoints are blocked.
- URLs with embedded credentials are blocked.
- Instructions that imply login bypass, captcha bypass, paywall bypass, stealth,
  broad crawling, or unrestricted scraping are blocked.
- Collection limits are clamped to conservative worker defaults for max pages,
  per-page timeout, total output size, and rate limit.

## Playwright Contract

The controlled Playwright executor navigates only to authorized URLs, blocks
downloads and local/internal network requests, avoids sensitive form submission,
captures rendered HTML/text, and writes screenshots as base64 data in the
research artifact. It returns command-shaped audit records instead of exposing a
general browser automation surface.

## Testing

Unit tests cover URL extraction, policy rejection, Firecrawl integration through
the policy, Playwright selection, Playwright artifact rendering, and blocked
out-of-scope navigation. Browser tests use a mocked Playwright adapter, not a
real browser.
