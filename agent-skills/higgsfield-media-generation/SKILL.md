---
name: higgsfield-media-generation
description: Plan and use Higgsfield-generated images, videos, character-consistent media, and motion assets for landing pages and other visual experiences when a Higgsfield MCP/CLI tool is available.
---

# Higgsfield Media Generation

Use Higgsfield when a site needs production-quality generated media: hero
images, product/lifestyle shots, short videos, campaign variants, cinematic
loops, character-consistent visuals, or visual references for animation.

## Integration Model

- Prefer Higgsfield MCP/CLI when the runtime has an authenticated Higgsfield
  account.
- In agent-platform runners, prefer the internal authenticated tool
  `POST /tools/higgsfield/generate-image` over raw CLI calls. It runs cost
  estimation, model selection, job waiting, asset download, and metadata capture.
- Do not assume API keys exist; Higgsfield authentication is account/OAuth based.
- Do not block delivery if Higgsfield is unavailable. Ship a strong layout with
  clear asset slots, prompts, alt text, dimensions, and fallback styling.
- Treat generated media as source assets: save them under the repo's existing
  public/assets convention, use stable filenames, and reference them from code.
- Never hotlink transient generation URLs directly in production pages.
- Prefer Higgsfield models covered by the account's unlimited/free-generation
  allowance before spending credits on router or premium models.

## Model Selection

For prompt-first landing page images, prefer this order unless the issue asks
for a specific model or visual style:

1. `seedream_v5_lite`
2. `flux_2`
3. `seedream_v4_5`
4. `nano_banana`
5. `kling_omni_image`
6. `gpt_image_2`

Use `text2image_soul_v2`, `soul_cinematic`, `soul_location`, or
`soul_cinema_studio` when the brief benefits from Higgsfield Soul/Cinema style
or character/location consistency.

Use `image_auto` only when model routing is specifically useful, when the issue
allows credit spend, or when the preferred models fail validation. Before using a
credit-consuming model, run `higgsfield generate cost <model> ...` and prefer
the lowest-cost acceptable option.

## Landing Page Usage

1. Decide what the media must communicate before generating it: offer, audience,
   product state, brand mood, composition, aspect ratio, and conversion goal.
2. Prefer one high-signal hero asset over many decorative images.
3. For product/service pages, generate media that reveals the real product,
   workflow, venue, state, or outcome. Avoid vague atmospheric stock-like scenes.
4. Use video/animation only when it improves comprehension, proof, or perceived
   quality. Provide a static poster/fallback and respect reduced motion.
5. Keep generated media accessible: meaningful `alt`, captions when useful,
   no critical text baked into images unless duplicated in HTML.
6. Optimize for web delivery: modern formats, explicit dimensions/aspect ratio,
   lazy loading below the fold, and no oversized media in the first viewport.

## Prompt Contract

When Higgsfield is available, generate a concise asset brief before calling the
tool:

- `asset_type`: image, video, loop, product shot, background, storyboard, etc.
- `preferred_model`: Higgsfield model id, with a short reason and cost/unlimited
  assumption.
- `purpose`: what page section and conversion moment it supports.
- `prompt`: concrete visual prompt with subject, scene, style, camera, lighting,
  brand mood, aspect ratio, and negative constraints.
- `output_requirements`: dimensions, duration, format, transparent/background,
  poster need, and target filename.
- `fallback`: CSS/HTML or static placeholder plan if generation is unavailable.

For image generation on agent-platform, call the runner tool with:

- `prompt`
- `aspectRatio`
- optional `model`
- optional `runId`
- optional `outputFilename`

Use the returned `artifactPath` as the source asset to copy into the generated
site repository. Do not use `resultUrl` directly in production code.

## Guardrails

- Do not generate misleading product claims, fake endorsements, fake UI states,
  or deceptive before/after imagery.
- Do not generate a person's likeness or brand/IP-sensitive creative unless the
  issue provides rights or explicit approval.
- Do not add large media files without checking repo conventions and build size.
- Do not add Higgsfield CLI/auth setup into generated customer repos unless the
  issue explicitly asks for ongoing generation workflows.
- If only planning is possible, commit the prompts and integration notes in a
  repo-appropriate file or issue comment instead of pretending assets exist.
