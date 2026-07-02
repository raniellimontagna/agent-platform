import type { ScrapingLimits } from './scrapingPolicy.js';

export const RESEARCH_HEADINGS = {
  landingPageBrief: '## Landing Page Brief',
  sources: '## Sources',
  limitations: '## Limitations',
  instagramGraphFindings: '## Instagram Graph API Findings',
  apifyInstagramFindings: '## Apify Instagram Findings',
  instagramFindings: '## Instagram Findings',
} as const;

export interface ResearchOutputSource {
  id: string;
  url: string;
  title: string;
  summary?: string;
  error?: string;
  durationMs: number;
}

export interface LandingGraphFinding {
  handle: string;
  status: string;
  profile?: {
    username: string;
    name?: string;
    followersCount?: number;
    mediaCount?: number;
  };
}

export interface LandingApifyFinding {
  handle: string;
  status: string;
  profile?: {
    username: string;
    fullName?: string;
    biography?: string;
    followersCount?: number;
    postsCount?: number;
  };
}

export function formatResearchPackHeader(issueIdentifier: string, generatedAt: Date): string[] {
  return [`# Research Pack - ${issueIdentifier}`, '', `Generated at: ${generatedAt.toISOString()}`];
}

export function formatPolicyLimitLine(limits: ScrapingLimits): string {
  return `- Policy: explicit URLs only; max ${limits.maxPages} page(s), timeout ${limits.timeoutMs}ms, output cap ${limits.maxOutputChars} chars, rate ${limits.rateLimitPerMinute}/min.`;
}

export function formatSourceEvidence(urls: string[]): string[] {
  return bulletList(
    urls.map((url) => `Use as source evidence: ${url}`),
    '- No explicit source URLs were available after policy filtering.',
  );
}

export function bulletList(items: string[], fallback: string): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : [fallback];
}

export function truncateBlock(text: string, maxChars: number): string {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 20).trim()}\n\n[truncated]`;
}

export function truncateInline(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function redactSensitiveText(value: string, exactSecrets: string[] = []): string {
  let redacted = value;
  for (const secret of new Set(exactSecrets.filter(Boolean))) {
    redacted = redacted.split(secret).join('[redacted]');
    const encodedSecret = encodeURIComponent(secret);
    if (encodedSecret && encodedSecret !== secret) {
      redacted = redacted.split(encodedSecret).join('[redacted]');
    }
  }
  return redacted.replace(/[A-Za-z0-9_-]{20,}/g, '[redacted]');
}

export function sanitizeStoredText(value: string, exactSecrets: string[]): string {
  return redactSensitiveText(value, exactSecrets);
}

export function formatLandingPageBrief(args: {
  job: {
    title: string;
    description: string;
  };
  sources: ResearchOutputSource[];
  instagramHandles: string[];
  graphFindings: LandingGraphFinding[];
  apifyFindings: LandingApifyFinding[];
}): string[] {
  const successfulSources = args.sources.filter((source) => !source.error);
  const failedSources = args.sources.filter((source) => source.error);
  const subject = landingSubject(args);
  const evidence = landingEvidence(args).slice(0, 6);
  const seoTerms = landingSeoTerms(args);
  const primaryUrls = args.sources.map((source) => source.url).slice(0, 5);
  const hasInstagram = args.instagramHandles.length > 0;

  return [
    RESEARCH_HEADINGS.landingPageBrief,
    '',
    '### Brand / Subject',
    '',
    `- Primary subject: ${subject}`,
    `- Request: ${args.job.title}`,
    `- Public handles: ${args.instagramHandles.length > 0 ? args.instagramHandles.map((handle) => `@${handle}`).join(', ') : 'none detected'}`,
    '',
    '### Audience Hypotheses',
    '',
    '- Treat the audience as prospects arriving from public web/social context; validate specifics against the evidence below.',
    hasInstagram
      ? '- Instagram presence suggests the page should connect social proof, visual identity, and direct contact paths.'
      : '- No Instagram handle was detected; use collected web sources as the main audience signal.',
    '',
    '### Offer And Conversion Angle',
    '',
    '- Lead with the clearest service/product promise supported by the collected sources.',
    '- Convert public facts into concise benefits; avoid claims that are not backed by the research pack.',
    '',
    '### Evidence To Reuse',
    '',
    ...bulletList(evidence, '- No reusable evidence was collected; keep claims conservative.'),
    '',
    '### Recommended Page Structure',
    '',
    '- Hero: subject, concrete value proposition, primary CTA, and visual drawn from public brand/profile cues.',
    '- Proof section: reuse follower/media/source facts only when present in the evidence.',
    '- Services/products section: describe observed offerings and avoid inventing prices or guarantees.',
    '- Objection handling: address gaps and limitations transparently when evidence is incomplete.',
    '- Final CTA: repeat the safest public contact or next-step route found in the sources.',
    '',
    '### SEO And Content Terms',
    '',
    ...bulletList(
      seoTerms,
      '- No stable SEO terms were extracted; derive terms manually from approved source copy.',
    ),
    '',
    '### Visual Direction',
    '',
    hasInstagram
      ? '- Use Instagram/profile cues as visual references, but do not copy private or hidden content.'
      : '- Use visible website/source cues for typography, imagery, color, and hierarchy.',
    '- Prefer real product/service/context imagery when available; otherwise request/generate a compliant hero asset.',
    '',
    '### Calls To Action',
    '',
    '- Primary CTA: choose the safest explicit action from the sources, such as contact, quote, booking, or profile visit.',
    '- Secondary CTA: invite users to view public proof, portfolio, services, or social profile when supported.',
    '',
    '### Risks / Gaps',
    '',
    `- Successful Firecrawl sources: ${successfulSources.length}; failed sources: ${failedSources.length}.`,
    hasInstagram
      ? '- Instagram public/authorized collection can miss hidden posts, private metrics, comments, DMs, and analytics.'
      : '- No social profile handle was available in the request.',
    '- Do not invent testimonials, prices, WhatsApp numbers, addresses, guarantees, or private analytics.',
    '',
    '### Source Handling',
    '',
    ...formatSourceEvidence(primaryUrls),
  ];
}

function landingSubject(args: {
  job: { title: string };
  sources: ResearchOutputSource[];
  instagramHandles: string[];
  graphFindings: LandingGraphFinding[];
  apifyFindings: LandingApifyFinding[];
}): string {
  const apifyProfile = args.apifyFindings.find(
    (finding) => finding.status === 'succeeded',
  )?.profile;
  if (apifyProfile?.fullName) return `${apifyProfile.fullName} (@${apifyProfile.username})`;
  const graphProfile = args.graphFindings.find(
    (finding) => finding.status === 'succeeded',
  )?.profile;
  if (graphProfile?.name) return `${graphProfile.name} (@${graphProfile.username})`;
  const successfulSource = args.sources.find((source) => !source.error && source.title.trim());
  if (successfulSource) return successfulSource.title;
  if (args.instagramHandles[0]) return `@${args.instagramHandles[0]}`;
  return args.job.title;
}

function landingEvidence(args: {
  sources: ResearchOutputSource[];
  graphFindings: LandingGraphFinding[];
  apifyFindings: LandingApifyFinding[];
}): string[] {
  const evidence: string[] = [];
  for (const finding of args.apifyFindings) {
    if (finding.status !== 'succeeded') continue;
    const profile = finding.profile;
    if (!profile) continue;
    if (profile.fullName) evidence.push(`@${finding.handle} public name: ${profile.fullName}`);
    if (profile.biography)
      evidence.push(`@${finding.handle} bio: ${truncateBlock(profile.biography, 220)}`);
    if (profile.followersCount !== undefined)
      evidence.push(`@${finding.handle} public followers: ${profile.followersCount}`);
    if (profile.postsCount !== undefined)
      evidence.push(`@${finding.handle} public posts/media count: ${profile.postsCount}`);
  }
  for (const finding of args.graphFindings) {
    if (finding.status !== 'succeeded') continue;
    const profile = finding.profile;
    if (!profile) continue;
    if (profile.name) evidence.push(`@${finding.handle} Graph name: ${profile.name}`);
    if (profile.followersCount !== undefined)
      evidence.push(`@${finding.handle} Graph public followers: ${profile.followersCount}`);
    if (profile.mediaCount !== undefined)
      evidence.push(`@${finding.handle} Graph media count: ${profile.mediaCount}`);
  }
  for (const source of args.sources) {
    if (source.error) continue;
    if (source.summary) {
      evidence.push(`${source.id} summary: ${truncateBlock(source.summary, 260)}`);
    } else {
      evidence.push(`${source.id} collected: ${source.title}`);
    }
  }
  return [...new Set(evidence)];
}

function landingSeoTerms(args: {
  job: { title: string; description: string };
  sources: ResearchOutputSource[];
  instagramHandles: string[];
}): string[] {
  const text = [
    args.job.title,
    args.job.description,
    ...args.instagramHandles,
    ...args.sources.flatMap((source) => [source.title, source.summary ?? '']),
  ].join(' ');
  const terms = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9-]{3,}/g);
  if (!terms) return [];
  const blocked = new Set([
    'https',
    'www',
    'instagram',
    'com',
    'para',
    'page',
    'landing',
    'publico',
    'publica',
    'buscar',
    'dados',
  ]);
  return [...new Set(terms.filter((term) => !blocked.has(term)))]
    .slice(0, 10)
    .map((term) => `Term: ${term}`);
}
