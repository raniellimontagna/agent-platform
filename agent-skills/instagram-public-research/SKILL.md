---
name: instagram-public-research
description: Collect Instagram-related public and first-party data safely for research packs, without posting, messaging, deleting, or bypassing access controls.
risk: caution
source: adapted-from-community
---

# Instagram Public Research

Use this skill when a data collection task needs Instagram context for market,
audience, competitor, campaign, creator, or content research.

This is a research-only skill. It must not publish content, send or reply to DMs,
delete or hide comments, automate engagement, scrape authenticated-only content,
or bypass login, paywalls, rate limits, bot protections, or platform controls.

## Allowed Sources

- Public Instagram profile, post, reel, or hashtag pages when they are accessible
  without login and the site terms allow access.
- Official Instagram Graph API data for accounts the operator owns or has
  explicit authorization to access.
- First-party exports provided by the user, such as analytics CSV/JSON, campaign
  reports, comments exports, or creator/media lists.
- Public linked sources around the Instagram content, such as brand websites,
  press pages, product pages, Linktree-style pages, and campaign landing pages.

## Preferred Collection Order

1. Use official first-party exports or Graph API data when credentials and
   authorization are explicitly available.
2. Use Firecrawl or normal HTTP extraction for public linked pages and public
   Instagram URLs that are accessible without login.
3. Record inaccessible or login-gated Instagram URLs as limitations instead of
   trying to bypass them.
4. Ask for an export or authorized API access when the requested facts require
   private analytics, comments, DMs, follower demographics, or account insights.

## Data To Extract

- Profile basics: handle, display name, bio, links, category, public follower and
  following counts when visible, and latest visible content themes.
- Content patterns: recurring topics, offer language, hooks, caption style,
  creative format, posting cadence inferred from visible dates, and CTA patterns.
- Engagement signals: public likes/comments/views only when visible and collected
  without login; otherwise state that the metric was unavailable.
- Audience and positioning clues: target persona, language, objections,
  community vocabulary, hashtags, proof points, and social proof.
- Landing page inputs: claims, benefits, product terms, pricing hints, guarantees,
  testimonials, visual motifs, and objections that can inform downstream LP work.
- SEO/content inputs: brand entities, product names, campaign terms, hashtags,
  creator names, locations, and topical clusters.

## Research Pack Requirements

- Treat every Instagram URL as a source with URL, access method, collection time,
  and whether the content was public, API-authorized, or user-provided.
- Separate facts from interpretation. Mark inferred audience, positioning, or
  strategy as inference.
- Include unavailable fields and the reason: login required, not visible, private
  account, API permission missing, rate limited, or blocked by policy.
- Prefer concise evidence-backed summaries over raw dumps of captions/comments.
- Never include private personal data unless the user supplied it and the task has
  explicit authorization and a clear business purpose.

## Disallowed Actions

- Publishing posts, stories, reels, or comments.
- Sending, reading, or replying to DMs unless a future authorized tool explicitly
  supports it with human approval.
- Deleting, hiding, liking, following, or otherwise engaging with Instagram content.
- Circumventing login, captcha, device checks, rate limits, Graph API permission
  requirements, robots.txt, or terms of service.
- Collecting sensitive personal data or building individual-level profiles.

## Output Shape

When Instagram data is relevant, add an `Instagram Findings` section to the
research pack:

- `Sources`: public/API/exported sources used.
- `Visible facts`: direct observations with citations.
- `Content and positioning patterns`: concise synthesized patterns.
- `Landing page implications`: claims, proof, audience language, visuals, and CTAs
  that downstream agents can use.
- `Limitations`: unavailable private metrics, access issues, permission gaps, and
  any inference boundaries.
